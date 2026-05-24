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
)

// 公共默认值(沿用 outlookEmail 项目内置 client_id,兼容已有 refresh_token)
const (
	defaultOAuthClientID    = "6daa9f56-5e67-4cb6-ae52-ef89ef912d36"
	defaultOAuthRedirectURI = "http://localhost:8080"
)

// defaultOAuthScopes 授权时申请的权限。
//   - offline_access 才会返回 refresh_token
//   - Mail.Read / Mail.ReadWrite 用于 Graph API
//   - User.Read 用于换取邮箱地址(回填到 UI)
var defaultOAuthScopes = []string{
	"offline_access",
	"https://graph.microsoft.com/Mail.Read",
	"https://graph.microsoft.com/Mail.ReadWrite",
	"https://graph.microsoft.com/User.Read",
}

// AuthURLResult 生成授权 URL 的结果
type AuthURLResult struct {
	AuthURL     string `json:"auth_url"`
	ClientID    string `json:"client_id"`
	RedirectURI string `json:"redirect_uri"`
}

// BuildAuthURL 构造 Microsoft 授权页面链接(common 多租户)。
// clientID/redirectURI 留空 → 走内置默认。
func (s *Service) BuildAuthURL(clientID, redirectURI string) AuthURLResult {
	if clientID == "" {
		clientID = defaultOAuthClientID
	}
	if redirectURI == "" {
		redirectURI = defaultOAuthRedirectURI
	}
	q := url.Values{}
	q.Set("client_id", clientID)
	q.Set("response_type", "code")
	q.Set("redirect_uri", redirectURI)
	q.Set("response_mode", "query")
	q.Set("scope", strings.Join(defaultOAuthScopes, " "))
	q.Set("state", "tool-forge")
	return AuthURLResult{
		AuthURL:     "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" + q.Encode(),
		ClientID:    clientID,
		RedirectURI: redirectURI,
	}
}

// ExchangeResult 换 token 的结果(给前端预览)
type ExchangeResult struct {
	ClientID     string `json:"client_id"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
	// Email 用 access_token 查 /me 拿到的真实邮箱(如果失败留空)
	Email string `json:"email,omitempty"`
}

// ExchangeCode 用授权回调拿到的 code 换 refresh_token。
//
// redirectedURL: 浏览器跳转到 http://localhost:8080/?code=XXX&state=... 的完整 URL
// clientID/redirectURI: 留空走内置默认,要跟 BuildAuthURL 用的同一对!
func (s *Service) ExchangeCode(ctx context.Context, redirectedURL, clientID, redirectURI string) (*ExchangeResult, error) {
	if clientID == "" {
		clientID = defaultOAuthClientID
	}
	if redirectURI == "" {
		redirectURI = defaultOAuthRedirectURI
	}
	code, err := extractCode(redirectedURL)
	if err != nil {
		return nil, err
	}

	httpc, err := s.httpc.Get(s.store.GetConfig().GlobalProxy)
	if err != nil {
		return nil, err
	}

	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("grant_type", "authorization_code")
	form.Set("scope", strings.Join(defaultOAuthScopes, " "))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURLGraph, strings.NewReader(form.Encode()))
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
		var apiErr struct {
			ErrorDescription string `json:"error_description"`
			Error            string `json:"error"`
		}
		_ = json.Unmarshal(body, &apiErr)
		msg := apiErr.ErrorDescription
		if msg == "" {
			msg = apiErr.Error
		}
		if msg == "" {
			msg = truncate(string(body), 300)
		}
		return nil, fmt.Errorf("换取 token 失败: %s", msg)
	}
	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if payload.RefreshToken == "" {
		return nil, errors.New("响应里没有 refresh_token,确认 scope 包含 offline_access")
	}
	res := &ExchangeResult{
		ClientID:     clientID,
		RefreshToken: payload.RefreshToken,
		AccessToken:  payload.AccessToken,
		ExpiresIn:    payload.ExpiresIn,
		Scope:        payload.Scope,
	}
	// 用 access_token 调一次 /me 把邮箱填进去(失败不影响)
	if email := graphMe(ctx, httpc, payload.AccessToken); email != "" {
		res.Email = email
	}
	return res, nil
}

// SaveFromAuthRequest 授权成功后保存账号到本地仓库的参数
type SaveFromAuthRequest struct {
	// 必填:授权回调 URL
	RedirectedURL string `json:"redirected_url"`

	// 自定义 client_id / redirect(空 = 默认)
	ClientID    string `json:"client_id,omitempty"`
	RedirectURI string `json:"redirect_uri,omitempty"`

	// 可选:用户填的邮箱 / 密码(为空时尝试从 access_token 拿邮箱)
	Email    string `json:"email,omitempty"`
	Password string `json:"password,omitempty"`

	GroupID string   `json:"group_id,omitempty"`
	Tags    []string `json:"tags,omitempty"`
	Remark  string   `json:"remark,omitempty"`
}

// SaveFromAuth 一键:换 token + 写入本地账号库。
func (s *Service) SaveFromAuth(ctx context.Context, req SaveFromAuthRequest) (*AccountView, error) {
	exc, err := s.ExchangeCode(ctx, req.RedirectedURL, req.ClientID, req.RedirectURI)
	if err != nil {
		return nil, err
	}
	email := strings.TrimSpace(req.Email)
	if email == "" {
		email = exc.Email
	}
	if email == "" {
		return nil, errors.New("没拿到邮箱地址,请在表单里填入邮箱后重试")
	}
	groupID := req.GroupID
	if groupID == "" {
		groupID = defaultGroupID
	}
	acc := &Account{
		Email:    email,
		Password: req.Password,
		ClientID: exc.ClientID,
		Type:     TypeOutlookOAuth,
		GroupID:  groupID,
		Tags:     req.Tags,
		Remark:   req.Remark,
		Status:   StatusActive, // 刚换完 token,可用
	}
	saved, err := s.store.AddAccount(acc, exc.RefreshToken)
	if err != nil {
		return nil, err
	}
	v := accountToView(saved)
	return &v, nil
}

// extractCode 从回调 URL 里解析 ?code=XXX
func extractCode(redirectedURL string) (string, error) {
	if strings.TrimSpace(redirectedURL) == "" {
		return "", errors.New("回调 URL 不能为空")
	}
	u, err := url.Parse(strings.TrimSpace(redirectedURL))
	if err != nil {
		return "", fmt.Errorf("URL 解析失败: %w", err)
	}
	code := u.Query().Get("code")
	if code == "" {
		// 部分浏览器把 query 留在 fragment 里
		if u.Fragment != "" {
			if vals, err := url.ParseQuery(u.Fragment); err == nil {
				code = vals.Get("code")
			}
		}
	}
	if code == "" {
		errDesc := u.Query().Get("error_description")
		if errDesc != "" {
			return "", fmt.Errorf("微软返回了错误: %s", errDesc)
		}
		return "", errors.New("URL 里找不到 ?code= 参数,确认是浏览器跳转后的完整 URL")
	}
	return code, nil
}

// graphMe 用 access_token 调一次 /me,返回 userPrincipalName(通常就是邮箱)
func graphMe(ctx context.Context, httpc *http.Client, accessToken string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	resp, err := httpc.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024))
	var payload struct {
		Mail              string `json:"mail"`
		UserPrincipalName string `json:"userPrincipalName"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	if payload.Mail != "" {
		return payload.Mail
	}
	return payload.UserPrincipalName
}
