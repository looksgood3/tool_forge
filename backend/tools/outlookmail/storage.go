package outlookmail

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Store 内存 + 文件持久化的账号/分组/配置仓库
type Store struct {
	mu        sync.RWMutex
	dir       string
	masterKey []byte

	accounts    map[string]*Account
	accountList []*Account // 按 CreatedAt 倒序
	groups      map[string]*Group
	groupList   []*Group
	config      Config

	accountsFile string
	groupsFile   string
	configFile   string
}

const (
	defaultGroupID   = "default"
	defaultGroupName = "默认分组"
)

// NewStore 初始化数据目录并加载已有数据。
// 数据落盘在 ~/.toolforge/outlook-mail/{accounts,groups,config}.json
// refresh_token 用主密钥 AES-256-GCM 加密;主密钥存系统凭据库。
func NewStore() (*Store, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	dir := filepath.Join(home, ".toolforge", "outlook-mail")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	mk, err := loadOrCreateMasterKey()
	if err != nil {
		return nil, fmt.Errorf("初始化主密钥失败: %w", err)
	}
	s := &Store{
		dir:          dir,
		masterKey:    mk,
		accounts:     make(map[string]*Account),
		groups:       make(map[string]*Group),
		accountsFile: filepath.Join(dir, "accounts.json"),
		groupsFile:   filepath.Join(dir, "groups.json"),
		configFile:   filepath.Join(dir, "config.json"),
		config:       DefaultConfig(),
	}
	s.loadGroups()
	s.loadAccounts()
	s.loadConfig()
	s.ensureDefaultGroup()
	return s, nil
}

func (s *Store) ensureDefaultGroup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.groups[defaultGroupID]; ok {
		return
	}
	g := &Group{
		ID:        defaultGroupID,
		Name:      defaultGroupName,
		Order:     0,
		CreatedAt: time.Now(),
	}
	s.groups[g.ID] = g
	s.rebuildGroupListLocked()
	_ = s.saveGroupsLocked()
}

// ----------------- 持久化:加载 -----------------

func (s *Store) loadAccounts() {
	data, err := os.ReadFile(s.accountsFile)
	if err != nil {
		return
	}
	var list []*Account
	if err := json.Unmarshal(data, &list); err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, a := range list {
		if a.ID == "" {
			continue
		}
		s.accounts[a.ID] = a
	}
	s.rebuildAccountListLocked()
}

func (s *Store) loadGroups() {
	data, err := os.ReadFile(s.groupsFile)
	if err != nil {
		return
	}
	var list []*Group
	if err := json.Unmarshal(data, &list); err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, g := range list {
		if g.ID == "" {
			continue
		}
		s.groups[g.ID] = g
	}
	s.rebuildGroupListLocked()
}

func (s *Store) loadConfig() {
	data, err := os.ReadFile(s.configFile)
	if err != nil {
		_ = s.saveConfig()
		return
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return
	}
	if cfg.ScheduleIntervalSec <= 0 {
		cfg.ScheduleIntervalSec = 3600
	}
	if cfg.AccountRefreshGapMs <= 0 {
		cfg.AccountRefreshGapMs = 500
	}
	if cfg.ScheduleType == "" {
		cfg.ScheduleType = "interval"
	}
	s.mu.Lock()
	s.config = cfg
	s.mu.Unlock()
}

// ----------------- 持久化:保存(全部) -----------------

func (s *Store) saveAccountsLocked() error {
	list := make([]*Account, 0, len(s.accounts))
	for _, a := range s.accounts {
		list = append(list, a)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].CreatedAt.After(list[j].CreatedAt) })
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return atomicWrite(s.accountsFile, data)
}

func (s *Store) saveGroupsLocked() error {
	list := make([]*Group, 0, len(s.groups))
	for _, g := range s.groups {
		list = append(list, g)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Order < list[j].Order })
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return atomicWrite(s.groupsFile, data)
}

func (s *Store) saveConfig() error {
	s.mu.RLock()
	cfg := s.config
	s.mu.RUnlock()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return atomicWrite(s.configFile, data)
}

func atomicWrite(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *Store) rebuildAccountListLocked() {
	list := make([]*Account, 0, len(s.accounts))
	for _, a := range s.accounts {
		list = append(list, a)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].CreatedAt.After(list[j].CreatedAt) })
	s.accountList = list
}

func (s *Store) rebuildGroupListLocked() {
	list := make([]*Group, 0, len(s.groups))
	for _, g := range s.groups {
		list = append(list, g)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Order != list[j].Order {
			return list[i].Order < list[j].Order
		}
		return list[i].CreatedAt.Before(list[j].CreatedAt)
	})
	s.groupList = list
}

// ----------------- Account API -----------------

// AddAccount 新增账号;refreshToken 为明文,内部会加密。
// 若 email 已存在 → 返回错误(重复导入)。
func (s *Store) AddAccount(a *Account, refreshToken string) (*Account, error) {
	if a.Email == "" || refreshToken == "" {
		return nil, errors.New("email 和 refresh_token 不能为空")
	}
	enc, err := encryptRT(s.masterKey, refreshToken)
	if err != nil {
		return nil, fmt.Errorf("加密 refresh_token 失败: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	// 重复检测
	for _, exist := range s.accounts {
		if exist.Email == a.Email {
			return nil, fmt.Errorf("邮箱已存在: %s", a.Email)
		}
	}
	now := time.Now()
	if a.ID == "" {
		a.ID = uuid.NewString()
	}
	if a.Type == "" {
		a.Type = TypeOutlookOAuth
	}
	if a.GroupID == "" {
		a.GroupID = defaultGroupID
	}
	if a.Status == "" {
		a.Status = StatusUnknown
	}
	a.EncryptedRefreshToken = enc
	a.CreatedAt = now
	a.UpdatedAt = now
	s.accounts[a.ID] = a
	s.rebuildAccountListLocked()
	if err := s.saveAccountsLocked(); err != nil {
		return nil, err
	}
	return a, nil
}

// UpdateAccount 修改账号字段(不含 refresh_token),按 ID 定位。
func (s *Store) UpdateAccount(id string, fn func(*Account)) (*Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.accounts[id]
	if !ok {
		return nil, fmt.Errorf("账号不存在: %s", id)
	}
	fn(a)
	a.UpdatedAt = time.Now()
	if err := s.saveAccountsLocked(); err != nil {
		return nil, err
	}
	return a, nil
}

// UpdateRefreshToken 更新 refresh_token(自动加密);用于 token 自我替换场景。
func (s *Store) UpdateRefreshToken(id, newRT string) error {
	if newRT == "" {
		return nil
	}
	enc, err := encryptRT(s.masterKey, newRT)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.accounts[id]
	if !ok {
		return fmt.Errorf("账号不存在: %s", id)
	}
	a.EncryptedRefreshToken = enc
	a.UpdatedAt = time.Now()
	return s.saveAccountsLocked()
}

// DecryptRT 临时解密某账号的 refresh_token;只在调用 OAuth 时使用,不要长期持有。
func (s *Store) DecryptRT(id string) (string, error) {
	s.mu.RLock()
	a, ok := s.accounts[id]
	s.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("账号不存在: %s", id)
	}
	return decryptRT(s.masterKey, a.EncryptedRefreshToken)
}

// DeleteAccount 按 ID 删除
func (s *Store) DeleteAccount(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.accounts[id]; !ok {
		return nil
	}
	delete(s.accounts, id)
	s.rebuildAccountListLocked()
	return s.saveAccountsLocked()
}

// GetAccount 取一份拷贝
func (s *Store) GetAccount(id string) (Account, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	a, ok := s.accounts[id]
	if !ok {
		return Account{}, fmt.Errorf("账号不存在: %s", id)
	}
	return *a, nil
}

// ListAccounts 返回脱敏后的视图列表,可按 GroupID 过滤。
// groupID 传空 = 所有分组。
func (s *Store) ListAccounts(groupID string) []AccountView {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AccountView, 0, len(s.accountList))
	for _, a := range s.accountList {
		if groupID != "" && a.GroupID != groupID {
			continue
		}
		out = append(out, accountToView(a))
	}
	return out
}

func accountToView(a *Account) AccountView {
	return AccountView{
		ID:            a.ID,
		Email:         a.Email,
		HasPassword:   a.Password != "",
		ClientID:      a.ClientID,
		Type:          a.Type,
		GroupID:       a.GroupID,
		Tags:          a.Tags,
		Remark:        a.Remark,
		Status:        a.Status,
		LastError:     a.LastError,
		HasProxy:      a.Proxy != "",
		Proxy:         a.Proxy,
		Disabled:      a.Disabled,
		Order:         a.Order,
		LastRefreshAt: a.LastRefreshAt,
		LastUsedAt:    a.LastUsedAt,
		CreatedAt:     a.CreatedAt,
		UpdatedAt:     a.UpdatedAt,
	}
}

// ----------------- Group API -----------------

// AddGroup 新建分组
func (s *Store) AddGroup(name, color string) (*Group, error) {
	if name == "" {
		return nil, errors.New("分组名不能为空")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, g := range s.groups {
		if g.Name == name {
			return nil, fmt.Errorf("分组已存在: %s", name)
		}
	}
	g := &Group{
		ID:        uuid.NewString(),
		Name:      name,
		Color:     color,
		Order:     len(s.groups),
		CreatedAt: time.Now(),
	}
	s.groups[g.ID] = g
	s.rebuildGroupListLocked()
	if err := s.saveGroupsLocked(); err != nil {
		return nil, err
	}
	return g, nil
}

// RenameGroup 重命名;默认分组允许改名
func (s *Store) RenameGroup(id, name string) error {
	if name == "" {
		return errors.New("分组名不能为空")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.groups[id]
	if !ok {
		return fmt.Errorf("分组不存在: %s", id)
	}
	g.Name = name
	return s.saveGroupsLocked()
}

// DeleteGroup 删除分组;默认分组不可删,其它分组下的账号会迁移到默认分组
func (s *Store) DeleteGroup(id string) error {
	if id == defaultGroupID {
		return errors.New("默认分组不可删除")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.groups[id]; !ok {
		return nil
	}
	// 迁移账号
	for _, a := range s.accounts {
		if a.GroupID == id {
			a.GroupID = defaultGroupID
			a.UpdatedAt = time.Now()
		}
	}
	delete(s.groups, id)
	s.rebuildGroupListLocked()
	if err := s.saveGroupsLocked(); err != nil {
		return err
	}
	return s.saveAccountsLocked()
}

// ListGroups 列出所有分组(按 Order)
func (s *Store) ListGroups() []Group {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Group, 0, len(s.groupList))
	for _, g := range s.groupList {
		out = append(out, *g)
	}
	return out
}

// ----------------- Config API -----------------

// GetConfig 返回当前配置
func (s *Store) GetConfig() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config
}

// UpdateConfig 保存新配置
func (s *Store) UpdateConfig(cfg Config) error {
	if cfg.ScheduleIntervalSec > 0 && cfg.ScheduleIntervalSec < 60 {
		return errors.New("刷新间隔不能小于 60 秒")
	}
	if cfg.AccountRefreshGapMs < 0 {
		return errors.New("账号间间隔不能为负")
	}
	if cfg.ScheduleType == "" {
		cfg.ScheduleType = "interval"
	}
	s.mu.Lock()
	s.config = cfg
	s.mu.Unlock()
	return s.saveConfig()
}

// AllAccounts 返回所有账号的浅拷贝,内部使用(刷新 worker / 取邮件等)。
// 不要把指针递出去,避免外部修改。
func (s *Store) AllAccounts() []Account {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Account, 0, len(s.accountList))
	for _, a := range s.accountList {
		out = append(out, *a)
	}
	return out
}
