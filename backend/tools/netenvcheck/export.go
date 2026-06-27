package netenvcheck

import (
	"encoding/json"
	"fmt"
	"html"
	"strings"
	"time"
)

// ExportReport 把体检结果导出为指定格式。format: md / json / html。返回内容与扩展名。
func ExportReport(rep Report, format string) (content, ext string, err error) {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "json":
		b, e := json.MarshalIndent(rep, "", "  ")
		if e != nil {
			return "", "", e
		}
		return string(b), "json", nil
	case "html":
		return exportHTML(rep), "html", nil
	case "md", "markdown", "":
		return exportMarkdown(rep), "md", nil
	default:
		return "", "", fmt.Errorf("不支持的格式: %s", format)
	}
}

func tsStr(ms int64) string {
	if ms <= 0 {
		return "-"
	}
	return time.UnixMilli(ms).Format("2006-01-02 15:04:05")
}

func yn(b bool) string {
	if b {
		return "是"
	}
	return "否"
}

func exportMarkdown(rep Report) string {
	var b strings.Builder
	b.WriteString("# 网络环境体检报告\n\n")
	fmt.Fprintf(&b, "- 生成时间:%s\n", tsStr(rep.GeneratedAt))
	fmt.Fprintf(&b, "- 评分预设:%s\n", rep.Preset)
	fmt.Fprintf(&b, "- **综合评分:%d / 100(%s)**\n\n", rep.Score, rep.Grade)

	b.WriteString("## 出口 IP\n\n")
	fmt.Fprintf(&b, "- 原生(%s):`%s`\n", rep.Backend.Via, rep.Backend.IP)
	fmt.Fprintf(&b, "- 浏览器(WebView):`%s`\n", rep.WebView.IP)
	g := rep.Backend.Geo
	fmt.Fprintf(&b, "- 归属:%s %s %s / %s %s\n", g.Country, g.Region, g.City, g.ASN, g.Org)
	fmt.Fprintf(&b, "- IP 类型:%s\n", g.IPType)
	fmt.Fprintf(&b, "- IP 时区:%s\n\n", g.Timezone)

	r := rep.Backend.Risk
	b.WriteString("## 风险标记\n\n")
	fmt.Fprintf(&b, "机房:%s / 代理:%s / VPN:%s / Tor:%s / 滥用:%s\n\n",
		yn(r.IsDatacenter), yn(r.IsProxy), yn(r.IsVPN), yn(r.IsTor), yn(r.IsAbuser))
	if len(r.Detail) > 0 {
		for _, d := range r.Detail {
			fmt.Fprintf(&b, "- %s\n", d)
		}
		b.WriteString("\n")
	}

	b.WriteString("## 双路对比\n\n")
	fmt.Fprintf(&b, "%s\n\n", rep.DualPath.Conclusion)

	b.WriteString("## WebRTC\n\n")
	if len(rep.WebRTC.IPs) > 0 {
		fmt.Fprintf(&b, "候选:%s,泄漏:%s\n\n", strings.Join(rep.WebRTC.IPs, ", "), yn(rep.WebRTC.Leak))
	} else {
		fmt.Fprintf(&b, "无公网候选(%s)\n\n", rep.WebRTC.Note)
	}

	b.WriteString("## DNS\n\n")
	fmt.Fprintf(&b, "本机解析器:%s\n\n%s\n\n", strings.Join(rep.DNS.LocalServers, ", "), rep.DNS.Note)

	c := rep.Consistency
	b.WriteString("## 一致性\n\n")
	fmt.Fprintf(&b, "- 时区:浏览器 %s / 系统 %s vs IP %s → %s\n", c.BrowserTimezone, c.SystemOffset, c.IPTimezone, yn(c.TimezoneMatch))
	fmt.Fprintf(&b, "- 语言:浏览器 %s / 系统 %s vs IP 国家 %s → %s\n", c.BrowserLanguage, c.SystemLanguage, c.IPCountry, yn(c.LanguageMatch))
	if c.AcceptLanguage != "" {
		fmt.Fprintf(&b, "- Accept-Language:%s\n", c.AcceptLanguage)
	}
	fmt.Fprintf(&b, "- UA 一致:%s\n\n", yn(c.UAConsistent))

	if len(rep.Deductions) > 0 {
		b.WriteString("## 扣分明细\n\n")
		for _, d := range rep.Deductions {
			fmt.Fprintf(&b, "- **-%d** %s(置信度:%s)— %s\n", d.Points, d.Title, d.Confidence, d.Detail)
		}
		b.WriteString("\n")
	}

	if len(rep.Remediation) > 0 {
		b.WriteString("## 修复建议\n\n")
		for _, m := range rep.Remediation {
			fmt.Fprintf(&b, "### %s(预估 +%d)\n\n", m.Title, m.Impact)
			for _, s := range m.Steps {
				fmt.Fprintf(&b, "- %s\n", s)
			}
			if m.Command != "" {
				fmt.Fprintf(&b, "- 命令:`%s`\n", m.Command)
			}
			b.WriteString("\n")
		}
	}
	return b.String()
}

func exportHTML(rep Report) string {
	md := exportMarkdown(rep)
	// 简单包一层 <pre>,保留可读性即可(报告以查阅为主,不追求富排版)
	var b strings.Builder
	b.WriteString("<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\">")
	b.WriteString("<title>网络环境体检报告</title>")
	b.WriteString("<style>body{font:14px/1.7 -apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#1f2937}pre{white-space:pre-wrap;word-break:break-word}</style>")
	b.WriteString("</head><body><pre>")
	b.WriteString(html.EscapeString(md))
	b.WriteString("</pre></body></html>")
	return b.String()
}
