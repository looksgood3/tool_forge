package outlookmail

import (
	"bytes"
	"encoding/base64"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"

	"golang.org/x/net/html/charset"
)

// parseRFC822 从 IMAP 取回的整封邮件字节流(RFC 5322)解析出 MailDetail。
//
// 优先取 text/html;同时把 text/plain 取出来作为 BodyText 兜底。
func parseRFC822(raw []byte, accountID string, folder Folder, uid string, seen bool) (*MailDetail, error) {
	msg, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	dec := new(mail.AddressParser)
	fromHeader := msg.Header.Get("From")
	fromAddr := ""
	fromName := ""
	if a, err := dec.Parse(fromHeader); err == nil {
		fromAddr = a.Address
		fromName = a.Name
	} else {
		fromAddr = fromHeader
	}
	subject := decodeMimeHeader(msg.Header.Get("Subject"))
	dateStr := msg.Header.Get("Date")
	t, _ := mail.ParseDate(dateStr)

	detail := &MailDetail{Mail: Mail{
		ID:        uid,
		AccountID: accountID,
		Subject:   subject,
		From:      fromAddr,
		FromName:  fromName,
		Received:  t,
		IsRead:    seen,
		Folder:    folder,
	}}

	ctype := msg.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(ctype)
	if err != nil {
		// 没有 Content-Type,当 text/plain 处理
		body, _ := io.ReadAll(msg.Body)
		detail.BodyText = string(body)
		return detail, nil
	}

	if strings.HasPrefix(mediaType, "multipart/") {
		if err := walkMultipart(msg.Body, params["boundary"], detail); err != nil {
			// 解析中途失败也返回已经拿到的内容
			return detail, nil
		}
		return detail, nil
	}

	// 单 part
	body, _ := io.ReadAll(msg.Body)
	decoded := decodeContent(body, msg.Header.Get("Content-Transfer-Encoding"))
	if charsetName := params["charset"]; charsetName != "" {
		if conv, err := convertCharset(decoded, charsetName); err == nil {
			decoded = conv
		}
	}
	switch mediaType {
	case "text/html":
		detail.BodyHTML = string(decoded)
		detail.BodyPreview = previewFromHTML(string(decoded))
	case "text/plain":
		detail.BodyText = string(decoded)
		if detail.BodyPreview == "" {
			detail.BodyPreview = previewFromText(string(decoded))
		}
	default:
		detail.BodyText = string(decoded)
	}
	return detail, nil
}

// walkMultipart 递归解析 multipart;在 detail 上累加 text/html、text/plain。
func walkMultipart(body io.Reader, boundary string, detail *MailDetail) error {
	if boundary == "" {
		return errors.New("multipart 缺少 boundary")
	}
	r := multipart.NewReader(body, boundary)
	for {
		part, err := r.NextPart()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		ctype := part.Header.Get("Content-Type")
		mediaType, params, _ := mime.ParseMediaType(ctype)
		if strings.HasPrefix(mediaType, "multipart/") {
			_ = walkMultipart(part, params["boundary"], detail)
			_ = part.Close()
			continue
		}
		raw, _ := io.ReadAll(part)
		_ = part.Close()
		// attachment 跳过(只看是否有)
		disp := part.Header.Get("Content-Disposition")
		if strings.HasPrefix(strings.ToLower(disp), "attachment") {
			detail.HasAttachment = true
			continue
		}
		decoded := decodeContent(raw, part.Header.Get("Content-Transfer-Encoding"))
		if cs := params["charset"]; cs != "" {
			if conv, err := convertCharset(decoded, cs); err == nil {
				decoded = conv
			}
		}
		switch mediaType {
		case "text/html":
			if detail.BodyHTML == "" {
				detail.BodyHTML = string(decoded)
			}
		case "text/plain":
			if detail.BodyText == "" {
				detail.BodyText = string(decoded)
			}
		}
	}
}

func decodeContent(raw []byte, enc string) []byte {
	switch strings.ToLower(strings.TrimSpace(enc)) {
	case "base64":
		// 邮件 base64 经常带换行
		clean := stripWhitespace(raw)
		decoded, err := base64.StdEncoding.DecodeString(string(clean))
		if err != nil {
			// 试一下 URLEncoding
			decoded2, err2 := base64.RawStdEncoding.DecodeString(string(clean))
			if err2 != nil {
				return raw
			}
			return decoded2
		}
		return decoded
	case "quoted-printable":
		decoded, err := io.ReadAll(quotedprintable.NewReader(bytes.NewReader(raw)))
		if err != nil {
			return raw
		}
		return decoded
	default:
		return raw
	}
}

func stripWhitespace(b []byte) []byte {
	out := make([]byte, 0, len(b))
	for _, c := range b {
		if c != ' ' && c != '\r' && c != '\n' && c != '\t' {
			out = append(out, c)
		}
	}
	return out
}

// convertCharset 把非 UTF-8 字符集转换为 UTF-8;失败时原样返回。
func convertCharset(raw []byte, csName string) ([]byte, error) {
	if strings.EqualFold(csName, "utf-8") || strings.EqualFold(csName, "us-ascii") {
		return raw, nil
	}
	r, err := charset.NewReaderLabel(csName, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	out, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// previewFromText 把纯文本第一行非空字符截 ~120 字符给列表预览
func previewFromText(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		runes := []rune(line)
		if len(runes) > 120 {
			return string(runes[:120]) + "..."
		}
		return line
	}
	return ""
}

// previewFromHTML 粗暴地剥 tag 后截短
func previewFromHTML(s string) string {
	stripped := htmlToText(s)
	return previewFromText(stripped)
}
