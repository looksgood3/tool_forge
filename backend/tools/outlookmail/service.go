package outlookmail

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Service 顶层服务,聚合 store + token + graph + imap
type Service struct {
	store     *Store
	httpc     *httpClientCache
	scheduler *scheduler
}

// New 初始化 Service。Storage 出错就返回错误(主密钥拿不到等)。
func New() (*Service, error) {
	st, err := NewStore()
	if err != nil {
		return nil, err
	}
	s := &Service{
		store: st,
		httpc: newHTTPClientCache(),
	}
	s.scheduler = newScheduler(s)
	return s, nil
}

// Start 启动后台 worker(定时刷新)
func (s *Service) Start(ctx context.Context) {
	s.scheduler.Start(ctx)
}

// Stop 关闭后台 worker
func (s *Service) Stop() {
	s.scheduler.Stop()
}

// effectiveProxy 账号代理 > 全局代理
func (s *Service) effectiveProxy(acc *Account) string {
	if acc != nil && acc.Proxy != "" {
		return acc.Proxy
	}
	return s.store.GetConfig().GlobalProxy
}

// httpClient 拿对应代理的 *http.Client(带缓存)
func (s *Service) httpClient(proxyURL string) (*httpClientWrapper, error) {
	c, err := s.httpc.Get(proxyURL)
	if err != nil {
		return nil, err
	}
	return &httpClientWrapper{c}, nil
}

type httpClientWrapper struct{ inner interface{} }

// ----------------- 账号 / 分组 -----------------

// ListAccounts groupID 空 = 所有分组
func (s *Service) ListAccounts(groupID string) []AccountView {
	return s.store.ListAccounts(groupID)
}

// ListGroups 列分组
func (s *Service) ListGroups() []Group {
	return s.store.ListGroups()
}

// AddGroup 新建分组
func (s *Service) AddGroup(name, color string) (*Group, error) {
	return s.store.AddGroup(name, color)
}

// RenameGroup 重命名
func (s *Service) RenameGroup(id, name string) error {
	return s.store.RenameGroup(id, name)
}

// DeleteGroup 删除分组(非默认)
func (s *Service) DeleteGroup(id string) error {
	return s.store.DeleteGroup(id)
}

// DeleteAccount 删除单个账号
func (s *Service) DeleteAccount(id string) error {
	return s.store.DeleteAccount(id)
}

// UpdateAccount 修改账号字段(标签 / 备注 / 代理 / 状态 / 分组)
func (s *Service) UpdateAccount(id string, patch AccountPatch) (*AccountView, error) {
	a, err := s.store.UpdateAccount(id, func(a *Account) {
		if patch.GroupID != nil {
			a.GroupID = *patch.GroupID
		}
		if patch.Tags != nil {
			a.Tags = *patch.Tags
		}
		if patch.Remark != nil {
			a.Remark = *patch.Remark
		}
		if patch.Proxy != nil {
			a.Proxy = *patch.Proxy
		}
		if patch.Status != nil {
			a.Status = *patch.Status
		}
	})
	if err != nil {
		return nil, err
	}
	v := accountToView(a)
	return &v, nil
}

// AccountPatch 部分更新(用指针区分"未传"和"清空")
type AccountPatch struct {
	GroupID *string        `json:"group_id,omitempty"`
	Tags    *[]string      `json:"tags,omitempty"`
	Remark  *string        `json:"remark,omitempty"`
	Proxy   *string        `json:"proxy,omitempty"`
	Status  *AccountStatus `json:"status,omitempty"`
}

// ----------------- 导入 -----------------

// Import 解析 raw 文本,每行一个 outlook 账号,格式:
//
//	email----password----client_id----refresh_token
//	email----password----refresh_token----client_id (自动识别)
//
// 自动识别规则:GUID 形式(8-4-4-4-12 hex)的是 client_id。
func (s *Service) Import(req ImportRequest) ImportResponse {
	if req.GroupID == "" {
		req.GroupID = defaultGroupID
	}
	resp := ImportResponse{Results: []ImportResult{}}
	lines := strings.Split(strings.ReplaceAll(req.Raw, "\r\n", "\n"), "\n")
	for i, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		resp.Total++
		r := ImportResult{Line: i + 1}
		parts := strings.Split(line, "----")
		if len(parts) != 4 {
			r.Success = false
			r.Reason = fmt.Sprintf("字段数应为 4(用 ---- 分隔),实际 %d", len(parts))
			resp.Failed++
			resp.Results = append(resp.Results, r)
			continue
		}
		email := strings.TrimSpace(parts[0])
		password := strings.TrimSpace(parts[1])
		a := strings.TrimSpace(parts[2])
		b := strings.TrimSpace(parts[3])
		var clientID, refreshToken string
		switch {
		case isGUID(a) && !isGUID(b):
			clientID, refreshToken = a, b
		case !isGUID(a) && isGUID(b):
			clientID, refreshToken = b, a
		case isGUID(a) && isGUID(b):
			// 两段都像 GUID,按默认顺序
			clientID, refreshToken = a, b
		default:
			// 都不像 GUID,按默认顺序
			clientID, refreshToken = a, b
		}
		r.Email = email
		if email == "" || refreshToken == "" {
			r.Reason = "email / refresh_token 不能为空"
			resp.Failed++
			resp.Results = append(resp.Results, r)
			continue
		}
		acc := &Account{
			Email:    email,
			Password: password,
			ClientID: clientID,
			Type:     TypeOutlookOAuth,
			GroupID:  req.GroupID,
			Tags:     req.Tags,
			Remark:   req.Remark,
			Status:   AccountStatus(req.Status),
		}
		if acc.Status == "" {
			acc.Status = StatusUnknown
		}
		saved, err := s.store.AddAccount(acc, refreshToken)
		if err != nil {
			r.Reason = err.Error()
			resp.Failed++
			resp.Results = append(resp.Results, r)
			continue
		}
		r.Success = true
		r.AccountID = saved.ID
		resp.Success++
		resp.Results = append(resp.Results, r)
	}
	return resp
}

// isGUID 判断 8-4-4-4-12 hex 形式(Microsoft Azure client_id 标准格式)
func isGUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
				return false
			}
		}
	}
	return true
}

// ----------------- Token 刷新 -----------------

// RefreshOne 刷新单账号,优先 Graph endpoint
func (s *Service) RefreshOne(ctx context.Context, accountID string) RefreshResult {
	acc, err := s.store.GetAccount(accountID)
	if err != nil {
		return RefreshResult{AccountID: accountID, Success: false, Reason: err.Error()}
	}
	rt, err := s.store.DecryptRT(accountID)
	if err != nil {
		return RefreshResult{AccountID: accountID, Email: acc.Email, Success: false, Reason: "解密 refresh_token 失败"}
	}
	httpc, err := s.httpc.Get(s.effectiveProxy(&acc))
	if err != nil {
		return RefreshResult{AccountID: accountID, Email: acc.Email, Success: false, Reason: err.Error()}
	}
	res, err := refreshToken(ctx, httpc, ModeGraph, acc.ClientID, rt)
	if err != nil {
		newStatus := StatusTokenExpired
		if errors.Is(err, ErrAccountBanned) {
			newStatus = StatusBanned
		}
		_, _ = s.store.UpdateAccount(accountID, func(a *Account) {
			a.Status = newStatus
			a.LastError = err.Error()
			now := time.Now()
			a.LastRefreshAt = &now
		})
		return RefreshResult{
			AccountID: accountID,
			Email:     acc.Email,
			Success:   false,
			Status:    newStatus,
			Reason:    err.Error(),
		}
	}
	// 成功;如果 Microsoft 给了新 refresh_token,更新存储
	if res.NewRefreshToken != "" && res.NewRefreshToken != rt {
		_ = s.store.UpdateRefreshToken(accountID, res.NewRefreshToken)
	}
	_, _ = s.store.UpdateAccount(accountID, func(a *Account) {
		a.Status = StatusActive
		a.LastError = ""
		now := time.Now()
		a.LastRefreshAt = &now
	})
	return RefreshResult{
		AccountID:    accountID,
		Email:        acc.Email,
		Success:      true,
		Status:       StatusActive,
		NewExpiresIn: res.ExpiresIn,
	}
}

// RefreshMany 批量刷新;ids 为空时刷全部
func (s *Service) RefreshMany(ctx context.Context, ids []string) []RefreshResult {
	if len(ids) == 0 {
		for _, a := range s.store.AllAccounts() {
			ids = append(ids, a.ID)
		}
	}
	cfg := s.store.GetConfig()
	gap := time.Duration(cfg.AccountRefreshGapMs) * time.Millisecond
	results := make([]RefreshResult, 0, len(ids))
	for i, id := range ids {
		select {
		case <-ctx.Done():
			return results
		default:
		}
		results = append(results, s.RefreshOne(ctx, id))
		if i < len(ids)-1 && gap > 0 {
			select {
			case <-ctx.Done():
				return results
			case <-time.After(gap):
			}
		}
	}
	return results
}

// ----------------- 邮件读取 -----------------

// ListMails 列出某账号某文件夹某页邮件:Graph 优先,失败时回退到 IMAP(新 → 老)
func (s *Service) ListMails(ctx context.Context, accountID string, folder Folder, page, pageSize int) (*MailPage, error) {
	acc, err := s.store.GetAccount(accountID)
	if err != nil {
		return nil, err
	}
	proxyURL := s.effectiveProxy(&acc)
	httpc, err := s.httpc.Get(proxyURL)
	if err != nil {
		return nil, err
	}
	rt, err := s.store.DecryptRT(accountID)
	if err != nil {
		return nil, err
	}

	// 优先 Graph
	tk, err := refreshToken(ctx, httpc, ModeGraph, acc.ClientID, rt)
	if err == nil {
		s.persistTokenSideEffects(accountID, tk, rt)
		page, gerr := graphListMails(ctx, httpc, accountID, tk.AccessToken, folder, page, pageSize)
		if gerr == nil {
			s.touchLastUsed(accountID)
			return page, nil
		}
		// Graph 401 等错误 → 尝试 IMAP
	}

	// IMAP 新版
	if mp, err := s.listMailsViaIMAP(ctx, &acc, rt, proxyURL, imapServerNew, folder, page, pageSize); err == nil {
		s.touchLastUsed(accountID)
		return mp, nil
	}

	// IMAP 老版
	mp, err := s.listMailsViaIMAP(ctx, &acc, rt, proxyURL, imapServerOld, folder, page, pageSize)
	if err == nil {
		s.touchLastUsed(accountID)
		return mp, nil
	}
	return nil, fmt.Errorf("Graph / IMAP 都失败,最后错误: %w", err)
}

func (s *Service) listMailsViaIMAP(ctx context.Context, acc *Account, rt, proxyURL, host string, folder Folder, page, pageSize int) (*MailPage, error) {
	httpc, err := s.httpc.Get(proxyURL)
	if err != nil {
		return nil, err
	}
	mode := ModeIMAPNew
	if host == imapServerOld {
		mode = ModeIMAPOld
	}
	tk, err := refreshToken(ctx, httpc, mode, acc.ClientID, rt)
	if err != nil {
		return nil, err
	}
	s.persistTokenSideEffects(acc.ID, tk, rt)

	dialer, err := imapDialer(proxyURL)
	if err != nil {
		return nil, err
	}
	return imapListMails(ctx, dialer, host, acc.Email, tk.AccessToken, acc.ID, folder, page, pageSize)
}

// GetMail 取邮件详情;Graph 优先,失败后 IMAP 兜底
func (s *Service) GetMail(ctx context.Context, accountID string, folder Folder, messageID string) (*MailDetail, error) {
	acc, err := s.store.GetAccount(accountID)
	if err != nil {
		return nil, err
	}
	proxyURL := s.effectiveProxy(&acc)
	httpc, err := s.httpc.Get(proxyURL)
	if err != nil {
		return nil, err
	}
	rt, err := s.store.DecryptRT(accountID)
	if err != nil {
		return nil, err
	}
	// Graph
	tk, err := refreshToken(ctx, httpc, ModeGraph, acc.ClientID, rt)
	if err == nil {
		s.persistTokenSideEffects(accountID, tk, rt)
		if d, gerr := graphGetMail(ctx, httpc, accountID, tk.AccessToken, messageID, folder); gerr == nil {
			s.touchLastUsed(accountID)
			return d, nil
		}
	}
	// IMAP 新
	if d, err := s.getMailViaIMAP(ctx, &acc, rt, proxyURL, imapServerNew, folder, messageID); err == nil {
		s.touchLastUsed(accountID)
		return d, nil
	}
	// IMAP 老
	d, err := s.getMailViaIMAP(ctx, &acc, rt, proxyURL, imapServerOld, folder, messageID)
	if err == nil {
		s.touchLastUsed(accountID)
		return d, nil
	}
	return nil, err
}

func (s *Service) getMailViaIMAP(ctx context.Context, acc *Account, rt, proxyURL, host string, folder Folder, uid string) (*MailDetail, error) {
	httpc, err := s.httpc.Get(proxyURL)
	if err != nil {
		return nil, err
	}
	mode := ModeIMAPNew
	if host == imapServerOld {
		mode = ModeIMAPOld
	}
	tk, err := refreshToken(ctx, httpc, mode, acc.ClientID, rt)
	if err != nil {
		return nil, err
	}
	s.persistTokenSideEffects(acc.ID, tk, rt)
	dialer, err := imapDialer(proxyURL)
	if err != nil {
		return nil, err
	}
	return imapGetMail(ctx, dialer, host, acc.Email, tk.AccessToken, acc.ID, folder, uid)
}

// Extract 用提取器跑一遍内容,返回验证码 + 链接。
// 入参:邮件 ID 或者前端预先取好的 detail。这里支持两种入口。
func (s *Service) Extract(ctx context.Context, accountID string, folder Folder, messageID string) (*ExtractResult, error) {
	detail, err := s.GetMail(ctx, accountID, folder, messageID)
	if err != nil {
		return nil, err
	}
	res := ExtractFromMail(detail.BodyText, detail.BodyHTML)
	return &res, nil
}

// ExtractFromText 直接对一段文本提取(用户粘贴)
func (s *Service) ExtractFromText(text string) *ExtractResult {
	res := ExtractFromMail(text, "")
	return &res
}

// ----------------- 配置 -----------------

// GetConfig 返回当前配置
func (s *Service) GetConfig() Config {
	return s.store.GetConfig()
}

// UpdateConfig 持久化新配置,并触发 scheduler 重新装载
func (s *Service) UpdateConfig(cfg Config) error {
	if err := s.store.UpdateConfig(cfg); err != nil {
		return err
	}
	s.scheduler.Reload()
	return nil
}

// ----------------- 内部 -----------------

func (s *Service) persistTokenSideEffects(accountID string, tk *TokenResult, oldRT string) {
	if tk == nil {
		return
	}
	if tk.NewRefreshToken != "" && tk.NewRefreshToken != oldRT {
		_ = s.store.UpdateRefreshToken(accountID, tk.NewRefreshToken)
	}
	_, _ = s.store.UpdateAccount(accountID, func(a *Account) {
		a.Status = StatusActive
		a.LastError = ""
		now := time.Now()
		a.LastRefreshAt = &now
	})
}

func (s *Service) touchLastUsed(accountID string) {
	_, _ = s.store.UpdateAccount(accountID, func(a *Account) {
		now := time.Now()
		a.LastUsedAt = &now
	})
}
