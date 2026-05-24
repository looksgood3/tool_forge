package outlookmail

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// graphFolderPath 把 outlook 文件夹枚举映射到 Graph API 的 wellKnownName
func graphFolderPath(f Folder) string {
	switch f {
	case FolderInbox:
		return "inbox"
	case FolderJunk:
		return "junkemail"
	case FolderDeleted:
		return "deleteditems"
	default:
		return "inbox"
	}
}

// graphMessage 对应 Graph API 的 message 资源(只挑用得到的字段)
type graphMessage struct {
	ID             string `json:"id"`
	Subject        string `json:"subject"`
	BodyPreview    string `json:"bodyPreview"`
	ReceivedAt     string `json:"receivedDateTime"`
	IsRead         bool   `json:"isRead"`
	HasAttachments bool   `json:"hasAttachments"`
	From           struct {
		EmailAddress struct {
			Name    string `json:"name"`
			Address string `json:"address"`
		} `json:"emailAddress"`
	} `json:"from"`
	Body struct {
		ContentType string `json:"contentType"`
		Content     string `json:"content"`
	} `json:"body"`
}

func (m graphMessage) toMail(accountID string, folder Folder) Mail {
	return Mail{
		ID:            m.ID,
		AccountID:     accountID,
		Subject:       m.Subject,
		From:          m.From.EmailAddress.Address,
		FromName:      m.From.EmailAddress.Name,
		Received:      fmtTime(m.ReceivedAt),
		IsRead:        m.IsRead,
		HasAttachment: m.HasAttachments,
		BodyPreview:   m.BodyPreview,
		Folder:        folder,
	}
}

// graphListMails 走 Graph API 拉某个文件夹的邮件列表(分页)
//
// page 1-based;每页 20。
func graphListMails(ctx context.Context, httpc *http.Client, accountID, accessToken string, folder Folder, page, pageSize int) (*MailPage, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	skip := (page - 1) * pageSize

	u, _ := url.Parse(fmt.Sprintf("https://graph.microsoft.com/v1.0/me/mailFolders/%s/messages", graphFolderPath(folder)))
	q := u.Query()
	q.Set("$top", fmt.Sprintf("%d", pageSize))
	q.Set("$skip", fmt.Sprintf("%d", skip))
	q.Set("$select", "id,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview")
	q.Set("$orderby", "receivedDateTime desc")
	q.Set("$count", "true")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("ConsistencyLevel", "eventual") // $count 需要

	resp, err := httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Graph API %d: %s", resp.StatusCode, truncate(string(body), 300))
	}

	var payload struct {
		Count int            `json:"@odata.count"`
		Value []graphMessage `json:"value"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("解析 Graph 响应失败: %w", err)
	}

	mails := make([]Mail, 0, len(payload.Value))
	for _, m := range payload.Value {
		mails = append(mails, m.toMail(accountID, folder))
	}
	nextPage := page + 1
	hasMore := skip+len(payload.Value) < payload.Count
	if !hasMore {
		nextPage = 0
	}
	return &MailPage{
		Mails:    mails,
		Total:    payload.Count,
		NextPage: nextPage,
		HasMore:  hasMore,
	}, nil
}

// graphGetMail 取单封邮件完整内容(含 HTML body)
func graphGetMail(ctx context.Context, httpc *http.Client, accountID, accessToken, messageID string, folder Folder) (*MailDetail, error) {
	u := fmt.Sprintf("https://graph.microsoft.com/v1.0/me/messages/%s", url.PathEscape(messageID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Graph 取邮件 %d: %s", resp.StatusCode, truncate(string(body), 300))
	}

	var m graphMessage
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, err
	}

	detail := &MailDetail{Mail: m.toMail(accountID, folder)}
	if strings.EqualFold(m.Body.ContentType, "html") {
		detail.BodyHTML = m.Body.Content
	} else {
		detail.BodyText = m.Body.Content
	}
	return detail, nil
}
