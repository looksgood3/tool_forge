package outlookmail

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/mail"
	"net/textproto"
	"strconv"
	"strings"
	"time"
)

var mimeWordDecoder = &mime.WordDecoder{}

// IMAP 服务器
const (
	imapServerNew = "outlook.live.com"      // 新版
	imapServerOld = "outlook.office365.com" // 老版
	imapPort      = 993
)

// imapFolderName 把 outlook 文件夹枚举映射到 IMAP 路径
func imapFolderName(f Folder) string {
	switch f {
	case FolderInbox:
		return "INBOX"
	case FolderJunk:
		return "Junk"
	case FolderDeleted:
		return "Deleted Items"
	default:
		return "INBOX"
	}
}

// imapClient 极简的 IMAP4rev1 客户端,只支持 XOAUTH2 + SELECT + UID SEARCH + UID FETCH。
//
// 用 net/textproto 读响应,自己处理 tag/literal 的解析。
// 故意不引入 emersion/go-imap;我们的需求(取最近 N 封 + 单封 RFC822)只需要这几个命令。
type imapClient struct {
	conn   net.Conn
	rw     *bufio.ReadWriter
	tp     *textproto.Reader
	tagSeq int
}

// dialIMAP 通过 dialer 拨号,完成 TLS 握手并读取 greeting 行。
//
// dialer 由 service 提供(可能是 socks5 或直连);函数里只关心 TLS 升级和读 greeting。
func dialIMAP(ctx context.Context, dialer func(ctx context.Context, network, addr string) (net.Conn, error), host string) (*imapClient, error) {
	if dialer == nil {
		var d net.Dialer
		dialer = func(ctx context.Context, network, addr string) (net.Conn, error) {
			return d.DialContext(ctx, network, addr)
		}
	}
	addr := fmt.Sprintf("%s:%d", host, imapPort)

	dialCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	raw, err := dialer(dialCtx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("拨号失败: %w", err)
	}
	// 设个统一的 deadline,避免吊死
	_ = raw.SetDeadline(time.Now().Add(60 * time.Second))

	tlsConn := tls.Client(raw, &tls.Config{ServerName: host})
	if err := tlsConn.HandshakeContext(dialCtx); err != nil {
		_ = raw.Close()
		return nil, fmt.Errorf("TLS 握手失败: %w", err)
	}

	br := bufio.NewReader(tlsConn)
	bw := bufio.NewWriter(tlsConn)
	c := &imapClient{
		conn: tlsConn,
		rw:   bufio.NewReadWriter(br, bw),
		tp:   textproto.NewReader(br),
	}
	// 读 greeting
	line, err := c.tp.ReadLine()
	if err != nil {
		_ = tlsConn.Close()
		return nil, fmt.Errorf("读 greeting 失败: %w", err)
	}
	if !strings.HasPrefix(line, "* OK") {
		_ = tlsConn.Close()
		return nil, fmt.Errorf("IMAP greeting 不是 OK: %s", line)
	}
	return c, nil
}

// Close 关闭连接(尽力 LOGOUT)
func (c *imapClient) Close() {
	if c == nil || c.conn == nil {
		return
	}
	_, _ = c.send("LOGOUT")
	_ = c.conn.Close()
}

// nextTag 返回单调递增的 IMAP tag(A001, A002...)
func (c *imapClient) nextTag() string {
	c.tagSeq++
	return fmt.Sprintf("A%03d", c.tagSeq)
}

// send 发送一行命令并读取响应(可能跨多行),直到看到 "<tag> OK/NO/BAD"。
//
// 返回 (所有行, 错误)。如果服务器答 NO/BAD,err != nil,但 lines 里仍有内容。
func (c *imapClient) send(cmd string) ([]string, error) {
	tag := c.nextTag()
	full := tag + " " + cmd + "\r\n"
	if _, err := c.rw.WriteString(full); err != nil {
		return nil, err
	}
	if err := c.rw.Flush(); err != nil {
		return nil, err
	}
	return c.readUntilTag(tag)
}

// sendRaw 发送一行(给 AUTHENTICATE 用,需要等 "+ " 后再发数据)
func (c *imapClient) sendRaw(line string) error {
	if _, err := c.rw.WriteString(line + "\r\n"); err != nil {
		return err
	}
	return c.rw.Flush()
}

func (c *imapClient) readLine() (string, error) {
	return c.tp.ReadLine()
}

// readUntilTag 一直读直到出现 "<tag> OK/NO/BAD ...";返回路上读到的所有行(含结束行)。
func (c *imapClient) readUntilTag(tag string) ([]string, error) {
	var lines []string
	for {
		line, err := c.tp.ReadLine()
		if err != nil {
			return lines, err
		}
		lines = append(lines, line)
		if strings.HasPrefix(line, tag+" ") {
			rest := strings.TrimPrefix(line, tag+" ")
			parts := strings.SplitN(rest, " ", 2)
			status := strings.ToUpper(parts[0])
			if status == "OK" {
				return lines, nil
			}
			return lines, fmt.Errorf("IMAP %s: %s", status, rest)
		}
	}
}

// readBytes 读取 n 个字节(给 literal {n} 用)
func (c *imapClient) readBytes(n int) ([]byte, error) {
	buf := make([]byte, n)
	if _, err := io.ReadFull(c.rw, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

// authXOAUTH2 用 XOAUTH2 完成认证。
//
// 协议:
//
//	C: A001 AUTHENTICATE XOAUTH2 <base64-payload>
//	S: A001 OK ...
//
// payload = "user=<email>\x01auth=Bearer <token>\x01\x01"
func (c *imapClient) authXOAUTH2(email, accessToken string) error {
	payload := fmt.Sprintf("user=%s\x01auth=Bearer %s\x01\x01", email, accessToken)
	encoded := base64.StdEncoding.EncodeToString([]byte(payload))
	_, err := c.send("AUTHENTICATE XOAUTH2 " + encoded)
	return err
}

// imapListMails 走 IMAP 拉某文件夹的邮件列表(page 1-based,每页 pageSize 封)
func imapListMails(ctx context.Context, dialer func(ctx context.Context, network, addr string) (net.Conn, error), host, email, accessToken string, accountID string, folder Folder, page, pageSize int) (*MailPage, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	c, err := dialIMAP(ctx, dialer, host)
	if err != nil {
		return nil, err
	}
	defer c.Close()
	if err := c.authXOAUTH2(email, accessToken); err != nil {
		return nil, fmt.Errorf("IMAP 认证失败: %w", err)
	}
	folderName := imapFolderName(folder)
	selectResp, err := c.send(fmt.Sprintf(`SELECT "%s"`, folderName))
	if err != nil {
		return nil, fmt.Errorf("SELECT %s 失败: %w", folderName, err)
	}
	total := parseExistsCount(selectResp)
	if total == 0 {
		return &MailPage{Mails: []Mail{}, Total: 0, HasMore: false}, nil
	}
	// 第 page 页:从倒数第 (page-1)*pageSize+1 封开始拉 pageSize 封
	endSeq := total - (page-1)*pageSize
	if endSeq <= 0 {
		return &MailPage{Mails: []Mail{}, Total: total, HasMore: false}, nil
	}
	startSeq := endSeq - pageSize + 1
	if startSeq < 1 {
		startSeq = 1
	}

	// FETCH startSeq:endSeq (UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] RFC822.SIZE)
	fetchCmd := fmt.Sprintf("FETCH %d:%d (UID FLAGS BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])", startSeq, endSeq)
	mails, err := c.fetchMailHeaders(fetchCmd, accountID, folder)
	if err != nil {
		return nil, err
	}
	// 按时间倒序
	reverseMails(mails)
	hasMore := startSeq > 1
	nextPage := page + 1
	if !hasMore {
		nextPage = 0
	}
	return &MailPage{
		Mails:    mails,
		Total:    total,
		HasMore:  hasMore,
		NextPage: nextPage,
	}, nil
}

func reverseMails(m []Mail) {
	for i, j := 0, len(m)-1; i < j; i, j = i+1, j-1 {
		m[i], m[j] = m[j], m[i]
	}
}

// imapGetMail 用 UID FETCH 取单封邮件的 RFC822 全文,解析成 MailDetail
func imapGetMail(ctx context.Context, dialer func(ctx context.Context, network, addr string) (net.Conn, error), host, email, accessToken string, accountID string, folder Folder, uid string) (*MailDetail, error) {
	c, err := dialIMAP(ctx, dialer, host)
	if err != nil {
		return nil, err
	}
	defer c.Close()
	if err := c.authXOAUTH2(email, accessToken); err != nil {
		return nil, fmt.Errorf("IMAP 认证失败: %w", err)
	}
	folderName := imapFolderName(folder)
	if _, err := c.send(fmt.Sprintf(`SELECT "%s"`, folderName)); err != nil {
		return nil, err
	}
	cmd := fmt.Sprintf("UID FETCH %s (UID FLAGS BODY.PEEK[])", uid)
	if _, err := c.rw.WriteString(c.nextTag() + " " + cmd + "\r\n"); err != nil {
		return nil, err
	}
	if err := c.rw.Flush(); err != nil {
		return nil, err
	}
	// 读响应:期望看到 "* <seq> FETCH (... BODY[] {<size>}\r\n<size 字节>\r\n ...)"
	// 然后 "<tag> OK ..."
	// 我们手工处理 literal {n}。
	var bodyBytes []byte
	var flags string
	tag := fmt.Sprintf("A%03d", c.tagSeq)
	for {
		line, err := c.tp.ReadLine()
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(line, tag+" ") {
			rest := strings.TrimPrefix(line, tag+" ")
			parts := strings.SplitN(rest, " ", 2)
			if strings.ToUpper(parts[0]) != "OK" {
				return nil, fmt.Errorf("IMAP UID FETCH: %s", rest)
			}
			break
		}
		// 查 literal 标记 "{<n>}"
		if idx := strings.LastIndex(line, "{"); idx >= 0 && strings.HasSuffix(line, "}") {
			numStr := line[idx+1 : len(line)-1]
			if n, err := strconv.Atoi(numStr); err == nil && n > 0 {
				buf, err := c.readBytes(n)
				if err != nil {
					return nil, err
				}
				bodyBytes = buf
				// literal 后还会有一行余下的"...)"
				_, _ = c.tp.ReadLine()
				continue
			}
		}
		if strings.Contains(line, "FLAGS") {
			flags = line
		}
	}
	if len(bodyBytes) == 0 {
		return nil, errors.New("IMAP 未返回邮件正文")
	}
	return parseRFC822(bodyBytes, accountID, folder, uid, flagsHasSeen(flags))
}

func flagsHasSeen(flagsLine string) bool {
	return strings.Contains(strings.ToLower(flagsLine), `\seen`)
}

// fetchMailHeaders 给 FETCH range 命令发完读全部响应,把每条 "* <seq> FETCH (..." 解析成 Mail。
func (c *imapClient) fetchMailHeaders(cmd, accountID string, folder Folder) ([]Mail, error) {
	tag := c.nextTag()
	if _, err := c.rw.WriteString(tag + " " + cmd + "\r\n"); err != nil {
		return nil, err
	}
	if err := c.rw.Flush(); err != nil {
		return nil, err
	}
	var mails []Mail
	var pending *fetchAccumulator
	for {
		line, err := c.tp.ReadLine()
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(line, tag+" ") {
			rest := strings.TrimPrefix(line, tag+" ")
			parts := strings.SplitN(rest, " ", 2)
			if strings.ToUpper(parts[0]) != "OK" {
				return nil, fmt.Errorf("IMAP FETCH: %s", rest)
			}
			break
		}
		// 多行 FETCH 响应里可能有 literal {n};literal 出现在 "BODY[..] {n}" 行的末尾。
		// 我们识别该模式后读取后续 n 字节作为头部数据。
		if pending == nil && strings.Contains(line, " FETCH ") {
			pending = &fetchAccumulator{header: ""}
			// 是否本行就带 UID/FLAGS
			pending.uid = parseUID(line)
			pending.seen = flagsHasSeen(line)
		}
		if pending != nil {
			if idx := strings.LastIndex(line, "{"); idx >= 0 && strings.HasSuffix(line, "}") {
				numStr := line[idx+1 : len(line)-1]
				if n, err := strconv.Atoi(numStr); err == nil && n > 0 {
					buf, err := c.readBytes(n)
					if err != nil {
						return nil, err
					}
					pending.header += string(buf)
					// 跟随的剩余行
					_, _ = c.tp.ReadLine()
				}
			}
			// 收尾标记:行末是 ")" 并且我们已经累积过 header
			if strings.HasSuffix(line, ")") && pending.header != "" {
				if m, ok := buildMailFromHeader(pending, accountID, folder); ok {
					mails = append(mails, m)
				}
				pending = nil
			}
		}
	}
	return mails, nil
}

type fetchAccumulator struct {
	uid    string
	seen   bool
	header string
}

func buildMailFromHeader(acc *fetchAccumulator, accountID string, folder Folder) (Mail, bool) {
	// header 里是 HEADER.FIELDS (FROM SUBJECT DATE) 的内容
	msg, err := mail.ReadMessage(strings.NewReader(acc.header))
	if err != nil {
		return Mail{}, false
	}
	dec := new(mail.AddressParser)
	from := msg.Header.Get("From")
	fromAddr := ""
	fromName := ""
	if addr, err := dec.Parse(from); err == nil {
		fromAddr = addr.Address
		fromName = addr.Name
	} else {
		fromAddr = from
	}
	subject := decodeMimeHeader(msg.Header.Get("Subject"))
	dateStr := msg.Header.Get("Date")
	t, _ := mail.ParseDate(dateStr)
	return Mail{
		ID:        acc.uid,
		AccountID: accountID,
		Subject:   subject,
		From:      fromAddr,
		FromName:  fromName,
		Received:  t,
		IsRead:    acc.seen,
		Folder:    folder,
	}, true
}

// parseUID 从一条 FETCH 行中解析 UID 值
func parseUID(line string) string {
	idx := strings.Index(line, "UID ")
	if idx < 0 {
		return ""
	}
	tail := line[idx+4:]
	end := 0
	for end < len(tail) && (tail[end] >= '0' && tail[end] <= '9') {
		end++
	}
	if end == 0 {
		return ""
	}
	return tail[:end]
}

// parseExistsCount 从 SELECT 响应里找 "* <N> EXISTS"
func parseExistsCount(lines []string) int {
	for _, l := range lines {
		if !strings.HasPrefix(l, "* ") {
			continue
		}
		rest := strings.TrimPrefix(l, "* ")
		parts := strings.Fields(rest)
		if len(parts) >= 2 && strings.EqualFold(parts[1], "EXISTS") {
			if n, err := strconv.Atoi(parts[0]); err == nil {
				return n
			}
		}
	}
	return 0
}

// decodeMimeHeader 解码 RFC 2047 编码的头(Subject 常见 =?UTF-8?B?...?=)
func decodeMimeHeader(s string) string {
	if s == "" {
		return ""
	}
	out, err := mimeWordDecoder.DecodeHeader(s)
	if err != nil {
		return s
	}
	return out
}
