package netscan

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// LookupDNS 查指定记录类型;types 可以是 ["A","AAAA","CNAME","MX","TXT","NS","SOA"],或 ["ALL"] 表示全查
func LookupDNS(domain string, types []string) DNSResult {
	domain = strings.TrimSpace(domain)
	if domain == "" {
		return DNSResult{Error: "domain 不能为空"}
	}
	r := DNSResult{Domain: domain}
	resolver := &net.Resolver{}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()

	wantAll := len(types) == 0
	want := make(map[string]bool)
	for _, t := range types {
		t = strings.ToUpper(strings.TrimSpace(t))
		if t == "ALL" || t == "" {
			wantAll = true
		}
		want[t] = true
	}
	if wantAll {
		for _, t := range []string{"A", "AAAA", "CNAME", "MX", "TXT", "NS"} {
			want[t] = true
		}
	}

	if want["A"] || want["AAAA"] {
		ips, err := resolver.LookupIPAddr(ctx, domain)
		if err != nil {
			r.Records = append(r.Records, DNSRecord{Type: "A/AAAA", Value: "查询失败: " + err.Error()})
		} else {
			for _, ip := range ips {
				is4 := ip.IP.To4() != nil
				if is4 && want["A"] {
					r.Records = append(r.Records, DNSRecord{Type: "A", Value: ip.IP.String()})
				} else if !is4 && want["AAAA"] {
					r.Records = append(r.Records, DNSRecord{Type: "AAAA", Value: ip.IP.String()})
				}
			}
		}
	}
	if want["CNAME"] {
		if cname, err := resolver.LookupCNAME(ctx, domain); err == nil && cname != "" && cname != domain+"." {
			r.Records = append(r.Records, DNSRecord{Type: "CNAME", Value: cname})
		}
	}
	if want["MX"] {
		if mxs, err := resolver.LookupMX(ctx, domain); err == nil {
			for _, mx := range mxs {
				r.Records = append(r.Records, DNSRecord{Type: "MX", Value: fmt.Sprintf("%d %s", mx.Pref, mx.Host)})
			}
		}
	}
	if want["TXT"] {
		if txts, err := resolver.LookupTXT(ctx, domain); err == nil {
			for _, t := range txts {
				r.Records = append(r.Records, DNSRecord{Type: "TXT", Value: t})
			}
		}
	}
	if want["NS"] {
		if nss, err := resolver.LookupNS(ctx, domain); err == nil {
			for _, ns := range nss {
				r.Records = append(r.Records, DNSRecord{Type: "NS", Value: ns.Host})
			}
		}
	}
	if want["SOA"] {
		// 标准库没有直接的 SOA 查询;通过 ns + 自己拼难度大,这里简单标个未支持
		r.Records = append(r.Records, DNSRecord{Type: "SOA", Value: "(未支持,需要外部 DNS 库)"})
	}
	if len(r.Records) == 0 {
		r.Error = "未查到任何记录"
	}
	return r
}
