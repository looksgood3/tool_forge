// Package outlookmail 实现 Outlook 邮箱批量管理:OAuth + Graph API + IMAP 兜底,
// 验证码/链接提取,定时刷新 Token。专注注册场景。
package outlookmail

import "time"

// AccountStatus 账号当前状态
type AccountStatus string

const (
	StatusActive       AccountStatus = "active"        // 正常,Token 可刷新
	StatusTokenExpired AccountStatus = "token_expired" // refresh_token 失效,需要重新授权
	StatusBanned       AccountStatus = "banned"        // 账号被微软封禁(service abuse mode)
	StatusUnknown      AccountStatus = "unknown"       // 刚导入,还没刷过 token
)

// AccountType 账号鉴权类型(一期只支持 outlook_oauth)
type AccountType string

const (
	TypeOutlookOAuth AccountType = "outlook_oauth"
)

// Folder 邮箱文件夹标识(Graph 用英文名,IMAP 走映射)
type Folder string

const (
	FolderInbox   Folder = "inbox"
	FolderJunk    Folder = "junkemail"
	FolderDeleted Folder = "deleteditems"
)

// Account 一个邮箱账号
type Account struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Password string `json:"password,omitempty"` // 邮箱密码,购买的号通常带,但本工具不强依赖
	ClientID string `json:"client_id"`

	// EncryptedRefreshToken 加密后的 refresh_token,base64(nonce+ciphertext)。
	// 内存里通过 DecryptRT() 临时解密;不向前端暴露。
	EncryptedRefreshToken string `json:"encrypted_refresh_token"`

	Type    AccountType `json:"type"`
	GroupID string      `json:"group_id"`
	Tags    []string    `json:"tags"`
	Remark  string      `json:"remark,omitempty"`

	Status    AccountStatus `json:"status"`
	LastError string        `json:"last_error,omitempty"` // 最近一次失败原因
	Proxy     string        `json:"proxy,omitempty"`      // 账号级代理,覆盖全局

	Disabled bool `json:"disabled,omitempty"` // 停用:不参与批量刷新 / UI 灰显
	Order    int  `json:"order,omitempty"`    // 用户自定义排序值;升序在前

	LastRefreshAt *time.Time `json:"last_refresh_at,omitempty"`
	LastUsedAt    *time.Time `json:"last_used_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// AccountView 给前端的视图(脱敏后的 Account)
type AccountView struct {
	ID            string        `json:"id"`
	Email         string        `json:"email"`
	HasPassword   bool          `json:"has_password"`
	ClientID      string        `json:"client_id"`
	Type          AccountType   `json:"type"`
	GroupID       string        `json:"group_id"`
	Tags          []string      `json:"tags"`
	Remark        string        `json:"remark,omitempty"`
	Status        AccountStatus `json:"status"`
	LastError     string        `json:"last_error,omitempty"`
	HasProxy      bool          `json:"has_proxy"`
	Proxy         string        `json:"proxy,omitempty"`
	Disabled      bool          `json:"disabled"`
	Order         int           `json:"order"`
	LastRefreshAt *time.Time    `json:"last_refresh_at,omitempty"`
	LastUsedAt    *time.Time    `json:"last_used_at,omitempty"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

// AccountSecret 给前端编辑账号弹窗用的解密视图(包含 refresh_token / password 明文)
type AccountSecret struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	Password     string `json:"password"`
	ClientID     string `json:"client_id"`
	RefreshToken string `json:"refresh_token"`
}

// Group 账号分组(用户自定义)
type Group struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color,omitempty"` // 可选: hex 颜色
	Order     int       `json:"order"`
	CreatedAt time.Time `json:"created_at"`
}

// Mail 邮件列表项(轻量)
type Mail struct {
	ID            string    `json:"id"` // Graph message id 或 IMAP UID
	AccountID     string    `json:"account_id"`
	Subject       string    `json:"subject"`
	From          string    `json:"from"`      // 邮件地址
	FromName      string    `json:"from_name"` // 显示名
	Received      time.Time `json:"received"`
	IsRead        bool      `json:"is_read"`
	HasAttachment bool      `json:"has_attachment"`
	BodyPreview   string    `json:"body_preview"`
	Folder        Folder    `json:"folder"`
}

// MailDetail 邮件详情(含正文)
type MailDetail struct {
	Mail
	BodyHTML string `json:"body_html"`
	BodyText string `json:"body_text"`
}

// MailPage 分页结果
type MailPage struct {
	Mails    []Mail `json:"mails"`
	Total    int    `json:"total"`
	NextPage int    `json:"next_page"` // 0 表示已经到底
	HasMore  bool   `json:"has_more"`
}

// ImportRequest 批量导入参数
type ImportRequest struct {
	GroupID string   `json:"group_id"`
	Tags    []string `json:"tags,omitempty"`
	Remark  string   `json:"remark,omitempty"`
	Status  string   `json:"status,omitempty"` // 期望初始状态,默认 unknown
	Raw     string   `json:"raw"`              // 多行文本,每行一个账号
}

// ImportResult 单条导入结果
type ImportResult struct {
	Line      int    `json:"line"` // 原始文本中的行号(1-based)
	Email     string `json:"email"`
	Success   bool   `json:"success"`
	Reason    string `json:"reason,omitempty"`
	AccountID string `json:"account_id,omitempty"`
}

// ImportResponse 整体导入结果
type ImportResponse struct {
	Total   int            `json:"total"`
	Success int            `json:"success"`
	Failed  int            `json:"failed"`
	Results []ImportResult `json:"results"`
}

// RefreshResult 单账号刷新结果
type RefreshResult struct {
	AccountID    string        `json:"account_id"`
	Email        string        `json:"email"`
	Success      bool          `json:"success"`
	Status       AccountStatus `json:"status"`
	Reason       string        `json:"reason,omitempty"`
	NewExpiresIn int           `json:"new_expires_in,omitempty"`
}

// ExtractResult 验证码 / 链接提取结果
type ExtractResult struct {
	Code   string   `json:"code,omitempty"`   // 提取出的验证码;空 = 未找到
	Links  []string `json:"links,omitempty"`  // 提取出的链接(去重 + 按相关度排序)
	Source string   `json:"source,omitempty"` // 命中方式:keyword / pattern / link
}

// Config 全局配置
type Config struct {
	// GlobalProxy 全局代理(账号级 Proxy 优先);格式 socks5://user:pass@host:port 或 http://...
	GlobalProxy string `json:"global_proxy,omitempty"`

	// ScheduleEnabled 是否启用定时刷新 Token
	ScheduleEnabled bool `json:"schedule_enabled"`

	// ScheduleType "interval"(每 N 秒)或 "cron"(5 段表达式)
	ScheduleType string `json:"schedule_type,omitempty"`

	// ScheduleIntervalSec 间隔模式下,刷新整圈的周期(秒);最小 60
	ScheduleIntervalSec int `json:"schedule_interval_sec,omitempty"`

	// ScheduleCron 5 段 Cron 表达式
	ScheduleCron string `json:"schedule_cron,omitempty"`

	// AccountRefreshGapMs 同一轮内,每个账号刷完后等待的毫秒数(避免触发频控)
	AccountRefreshGapMs int `json:"account_refresh_gap_ms,omitempty"`
}

// DefaultConfig 默认配置
func DefaultConfig() Config {
	return Config{
		ScheduleEnabled:     false,
		ScheduleType:        "interval",
		ScheduleIntervalSec: 3600, // 默认 1 小时
		AccountRefreshGapMs: 500,
	}
}
