package outlookmail

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// 三个 OAuth 端点(对应原项目 3 种读邮件方式)
const (
	tokenURLLive  = "https://login.live.com/oauth20_token.srf"                      // 老版 IMAP
	tokenURLIMAP  = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token" // 新版 IMAP scope
	tokenURLGraph = "https://login.microsoftonline.com/common/oauth2/v2.0/token"    // Graph scope
)

// scope 常量
const (
	scopeGraph = "https://graph.microsoft.com/.default"
	scopeIMAP  = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access"
)

// TokenResult OAuth 刷新结果
type TokenResult struct {
	AccessToken     string
	RefreshToken    string // 可能是新的(Microsoft 的 refresh token 会自我替换)
	NewRefreshToken string
	ExpiresIn       int
	Scope           string
}

// TokenMode 取 Token 的目的(决定走哪个端点)
type TokenMode int

const (
	ModeGraph   TokenMode = iota // Graph 走 common
	ModeIMAPNew                  // 新 IMAP 走 consumers
	ModeIMAPOld                  // 老 IMAP 走 login.live.com
)

// refreshToken 调用 OAuth 端点换取 access_token
//
// httpc 由 service 注入,带账号级代理。
// 错误返回时,如果是"账号被封禁"会用特殊 sentinel 包装,上层据此把账号置为 banned。
func refreshToken(ctx context.Context, httpc *http.Client, mode TokenMode, clientID, refreshToken string) (*TokenResult, error) {
	if clientID == "" || refreshToken == "" {
		return nil, errors.New("client_id 或 refresh_token 为空")
	}

	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)

	var endpoint string
	switch mode {
	case ModeGraph:
		endpoint = tokenURLGraph
		form.Set("scope", scopeGraph)
	case ModeIMAPNew:
		endpoint = tokenURLIMAP
		form.Set("scope", scopeIMAP)
	case ModeIMAPOld:
		endpoint = tokenURLLive
		// 老版 endpoint 不带 scope
	default:
		return nil, fmt.Errorf("unknown token mode: %d", mode)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	if resp.StatusCode != http.StatusOK {
		// "User account is found to be in service abuse mode" → 账号被封禁
		if strings.Contains(string(body), "service abuse mode") {
			return nil, ErrAccountBanned
		}
		return nil, fmt.Errorf("token endpoint %d: %s", resp.StatusCode, truncate(string(body), 300))
	}

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("解析 token 响应失败: %w", err)
	}
	if payload.AccessToken == "" {
		return nil, errors.New("token 响应缺少 access_token")
	}

	out := &TokenResult{
		AccessToken: payload.AccessToken,
		ExpiresIn:   payload.ExpiresIn,
		Scope:       payload.Scope,
	}
	// Microsoft 的 refresh_token 可能会被替换,优先用新的
	if payload.RefreshToken != "" {
		out.RefreshToken = payload.RefreshToken
		out.NewRefreshToken = payload.RefreshToken
	} else {
		out.RefreshToken = refreshToken
	}
	return out, nil
}

// ErrAccountBanned 账号被微软封禁(service abuse mode);上层应把状态置为 banned。
var ErrAccountBanned = errors.New("Microsoft 账号已被封禁(service abuse mode)")

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// fmtTime 给 Graph API 的 receivedDateTime(ISO 8601)解析成 time.Time;失败返回零值。
func fmtTime(s string) time.Time {
	if s == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t
	}
	// Graph 有时会用 ".0000000Z" 结尾,这种被 RFC3339 拒绝;用 RFC3339Nano 兜底
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t
	}
	return time.Time{}
}
