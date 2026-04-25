package netscan

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"regexp"
	"strings"
	"time"
)

const (
	ianaWhoisServer = "whois.iana.org"
	whoisPort       = 43
)

// LookupWhois 走 TCP 43 端口查询 WHOIS。先问 IANA 拿 TLD 的权威 server,然后再去查
func LookupWhois(domain string) WhoisResult {
	domain = strings.TrimSpace(strings.ToLower(domain))
	if domain == "" {
		return WhoisResult{Error: "domain 不能为空"}
	}
	r := WhoisResult{Domain: domain, Parsed: map[string]string{}}

	// 1. 问 IANA 拿权威 server
	authServer, ianaRaw, err := queryWhois(ianaWhoisServer, domain, 6*time.Second)
	if err != nil {
		// 直接 fallback 用 IANA 返回的内容(很可能是 IANA 直接给了答复或转跳信息)
		r.Server = ianaWhoisServer
		r.Raw = ianaRaw
		r.Error = err.Error()
		r.Parsed = parseWhois(ianaRaw)
		return r
	}
	if authServer == "" {
		r.Server = ianaWhoisServer
		r.Raw = ianaRaw
		r.Parsed = parseWhois(ianaRaw)
		return r
	}

	// 2. 用权威 server 查
	finalServer, raw, err := queryWhois(authServer, domain, 6*time.Second)
	if err != nil {
		r.Server = authServer
		r.Raw = raw
		r.Error = err.Error()
		r.Parsed = parseWhois(raw)
		return r
	}
	// 部分 TLD(如 .com)还会跳一次到 registrar 自己的 whois
	if finalServer != "" && !strings.EqualFold(finalServer, authServer) {
		_, raw2, err2 := queryWhois(finalServer, domain, 6*time.Second)
		if err2 == nil && raw2 != "" {
			raw = raw2
			authServer = finalServer
		}
	}
	r.Server = authServer
	r.Raw = raw
	r.Parsed = parseWhois(raw)
	return r
}

// queryWhois 给定一个 whois server,查 domain。返回 (上游建议的下一跳 server, 原文, error)
func queryWhois(server, domain string, timeout time.Duration) (nextServer string, raw string, err error) {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(server, fmt.Sprint(whoisPort)), timeout)
	if err != nil {
		return "", "", err
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(timeout))
	if _, err := fmt.Fprintf(conn, "%s\r\n", domain); err != nil {
		return "", "", err
	}
	data, err := io.ReadAll(conn)
	if err != nil {
		return "", string(data), err
	}
	raw = string(data)
	nextServer = extractWhoisRefer(raw)
	return nextServer, raw, nil
}

var (
	reReferLine = regexp.MustCompile(`(?im)^\s*(?:refer|whois server|registrar whois server)\s*:\s*(\S+)`)
)

func extractWhoisRefer(raw string) string {
	if m := reReferLine.FindStringSubmatch(raw); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// parseWhois 抽几个常见字段,做成 key→value(简单版,只取第一个匹配)
func parseWhois(raw string) map[string]string {
	out := map[string]string{}
	keys := []string{
		"Domain Name",
		"Registrar",
		"Registrar URL",
		"Updated Date",
		"Creation Date",
		"Registry Expiry Date",
		"Registrar IANA ID",
		"Registrant Organization",
		"Registrant Country",
		"Name Server",
		"DNSSEC",
		"Status",
	}
	keySet := map[string]bool{}
	for _, k := range keys {
		keySet[strings.ToLower(k)] = true
	}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "%") || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, ":")
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if val == "" {
			continue
		}
		lkey := strings.ToLower(key)
		if !keySet[lkey] {
			continue
		}
		// Name Server / Status 可能多个,用换行连接
		if existing, ok := out[key]; ok {
			out[key] = existing + "\n" + val
		} else {
			out[key] = val
		}
	}
	return out
}
