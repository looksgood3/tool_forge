package netenvcheck

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/proxy"
)

// Run 执行一次完整体检。浏览器侧信号由 in.Browser 传入。
func Run(ctx context.Context, in Input) Report {
	if in.Preset == "" {
		in.Preset = PresetBalanced
	}
	rep := Report{Preset: in.Preset, GeneratedAt: time.Now().UnixMilli()}

	client, via := buildClient(in)
	rep.Backend.Via = via

	var (
		mu      sync.Mutex
		sources []SourceStat
	)
	stat := func(name string, start time.Time, err error) {
		mu.Lock()
		sources = append(sources, SourceStat{
			Source: name,
			OK:     err == nil,
			Error:  errStr(err),
			MS:     int(time.Since(start).Milliseconds()),
		})
		mu.Unlock()
	}

	// 1) 出口 IP(ipify)
	ip := ""
	{
		start := time.Now()
		v, err := safeIP(func() (string, error) { return fetchEgressIP(ctx, client) })
		ip = v
		stat("ipify", start, err)
	}

	// 2) ifconfig.co 备用归属(self-report);ipify 失败时用它兜底出口 IP
	var collected []probeResult
	if sourceEnabled(in.Sources, "ifconfig.co") {
		start := time.Now()
		r, err := safeProbe(func() (probeResult, error) { return fetchIfconfig(ctx, client) })
		stat("ifconfig.co", start, err)
		if err == nil {
			r.source = "ifconfig.co"
			collected = append(collected, r)
			if ip == "" {
				ip = r.ip
			}
		}
	}

	if ip == "" && rep.Backend.Error == "" {
		rep.Backend.Error = "无法获取出口 IP(网络不通或代理未生效?)"
	}

	// 3) 并行:ipwho.is / ipapi.is / ipinfo.io(都需要出口 IP)
	if ip != "" {
		var wg sync.WaitGroup
		runP := func(name string, fn func() (probeResult, error)) {
			wg.Add(1)
			go func() {
				defer wg.Done()
				start := time.Now()
				r, err := safeProbe(fn)
				stat(name, start, err)
				if err == nil {
					r.source = name
					mu.Lock()
					collected = append(collected, r)
					mu.Unlock()
				}
			}()
		}
		if sourceEnabled(in.Sources, "ipwho.is") {
			runP("ipwho.is", func() (probeResult, error) { return fetchIPWhoIs(ctx, client, ip) })
		}
		if sourceEnabled(in.Sources, "ipapi.is") {
			runP("ipapi.is", func() (probeResult, error) { return fetchIPApiIs(ctx, client, ip) })
		}
		if token := strings.TrimSpace(in.IPinfoToken); token != "" && sourceEnabled(in.Sources, "ipinfo.io") {
			runP("ipinfo.io", func() (probeResult, error) { return fetchIPInfo(ctx, client, ip, token) })
		}
		wg.Wait()
	}

	rep.Backend.IP = ip
	rep.Backend.Geo, rep.Backend.Risk = mergeResults(collected)

	// 4) WebView 路(回显前端)+ 双路对比 + WebRTC
	rep.WebView = IPView{IP: in.Browser.EgressIP, Error: in.Browser.EgressIPErr}
	rep.DualPath = buildDualPath(ip, in.Browser.EgressIP, in.ForceDirect)
	anchor := in.Browser.EgressIP
	if anchor == "" {
		anchor = ip
	}
	rep.WebRTC = buildWebRTC(in.Browser, anchor)

	// 5) DNS
	if servers, err := localDNSServers(); err != nil {
		rep.DNS = DNSInfo{Error: err.Error()}
	} else {
		rep.DNS = analyzeDNS(servers)
	}

	// 6) 一致性 + 评分
	rep.Consistency = buildConsistency(in, rep.Backend.Geo)
	computeScore(&rep)

	rep.Sources = sortSources(sources)
	return rep
}

// buildClient 按入参构造 http.Client,返回客户端与「出口路径」描述。
func buildClient(in Input) (*http.Client, string) {
	tr := &http.Transport{
		ForceAttemptHTTP2:   true,
		MaxIdleConns:        10,
		IdleConnTimeout:     30 * time.Second,
		TLSHandshakeTimeout: 8 * time.Second,
	}
	via := "代理(env/TUN)"
	switch {
	case in.ForceDirect:
		tr.Proxy = nil
		via = "强制直连"
	case strings.TrimSpace(in.ProxyURL) != "":
		if u, err := url.Parse(strings.TrimSpace(in.ProxyURL)); err == nil {
			switch u.Scheme {
			case "http", "https":
				tr.Proxy = http.ProxyURL(u)
				via = "手动代理 " + u.Host
			case "socks5", "socks5h":
				var auth *proxy.Auth
				if u.User != nil {
					pw, _ := u.User.Password()
					auth = &proxy.Auth{User: u.User.Username(), Password: pw}
				}
				if d, derr := proxy.SOCKS5("tcp", u.Host, auth, proxy.Direct); derr == nil {
					tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
						if cd, ok := d.(proxy.ContextDialer); ok {
							return cd.DialContext(ctx, network, addr)
						}
						return d.Dial(network, addr)
					}
					via = "手动代理 " + u.Host
				}
			}
		}
	default:
		tr.Proxy = http.ProxyFromEnvironment
	}
	return &http.Client{Timeout: 12 * time.Second, Transport: tr}, via
}

// mergeResults 合并多源:归属逐字段取优先级最高的非空值;风险标记 OR 所有给出判定的源。
func mergeResults(results []probeResult) (GeoInfo, RiskFlags) {
	sorted := make([]probeResult, len(results))
	copy(sorted, results)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sourcePriority(sorted[i].source) < sourcePriority(sorted[j].source)
	})

	geo := GeoInfo{}
	fill := func(dst *string, v string) {
		if *dst == "" {
			*dst = v
		}
	}
	fillF := func(dst *float64, v float64) {
		if *dst == 0 && v != 0 {
			*dst = v
		}
	}
	risk := RiskFlags{}
	rawType := ""
	for _, r := range sorted {
		if rawType == "" && r.ipType != "" {
			rawType = r.ipType
		}
		g := r.geo
		fill(&geo.Country, g.Country)
		fill(&geo.CountryCode, g.CountryCode)
		fill(&geo.Region, g.Region)
		fill(&geo.City, g.City)
		fill(&geo.Timezone, g.Timezone)
		fill(&geo.ASN, g.ASN)
		fill(&geo.Org, g.Org)
		fillF(&geo.Latitude, g.Latitude)
		fillF(&geo.Longitude, g.Longitude)

		if !r.hasRisk {
			continue
		}
		risk.Sources = append(risk.Sources, r.source)
		var hit []string
		if r.risk.IsDatacenter {
			risk.IsDatacenter = true
			hit = append(hit, "机房")
		}
		if r.risk.IsProxy {
			risk.IsProxy = true
			hit = append(hit, "代理")
		}
		if r.risk.IsVPN {
			risk.IsVPN = true
			hit = append(hit, "VPN")
		}
		if r.risk.IsTor {
			risk.IsTor = true
			hit = append(hit, "Tor")
		}
		if r.risk.IsAbuser {
			risk.IsAbuser = true
			hit = append(hit, "滥用")
		}
		if r.risk.IsMobile {
			risk.IsMobile = true
		}
		if r.risk.Hosting != "" && risk.Hosting == "" {
			risk.Hosting = r.risk.Hosting
		}
		if len(hit) > 0 {
			risk.Detail = append(risk.Detail, r.source+": "+strings.Join(hit, "、"))
		} else {
			risk.Detail = append(risk.Detail, r.source+": 未发现风险")
		}
	}
	risk.Sources = dedupStrings(risk.Sources)
	geo.IPType = deriveIPType(rawType, risk)
	return geo, risk
}

// deriveIPType 把 ipapi.is 原始类型 + 风险标记映射成中文 IP 类型标签。
func deriveIPType(raw string, risk RiskFlags) string {
	switch {
	case risk.IsDatacenter:
		return "机房/托管"
	case risk.IsMobile:
		return "移动网络"
	}
	switch strings.ToLower(raw) {
	case "isp":
		return "住宅/家庭宽带"
	case "business":
		return "商业宽带"
	case "education":
		return "教育网"
	case "hosting":
		return "机房/托管"
	case "government":
		return "政府/机构"
	case "":
		return ""
	default:
		return raw
	}
}

func sourceEnabled(enabled []string, name string) bool {
	if len(enabled) == 0 {
		return true
	}
	for _, s := range enabled {
		if s == name {
			return true
		}
	}
	return false
}

func sourcePriority(name string) int {
	switch name {
	case "ipapi.is":
		return 0
	case "ipwho.is":
		return 1
	case "ifconfig.co":
		return 2
	case "ipinfo.io":
		return 3
	}
	return 9
}

// buildDualPath 对比后端(原生)出口与浏览器(WebView)出口。
func buildDualPath(backendIP, webViewIP string, forceDirect bool) DualPath {
	dp := DualPath{BackendIP: backendIP, WebViewIP: webViewIP, Match: true, Severity: "ok"}
	if backendIP == "" || webViewIP == "" {
		dp.Severity = "warn"
		dp.Conclusion = "缺少一侧出口 IP,无法对比(检查网络/代理是否正常)。"
		return dp
	}
	equal := backendIP == webViewIP
	if forceDirect {
		if equal {
			dp.Match = false
			dp.Severity = "bad"
			dp.Conclusion = fmt.Sprintf("强制直连出口(%s)与浏览器出口相同——代理未改变出口或未生效。", backendIP)
		} else {
			dp.Conclusion = fmt.Sprintf("强制直连真实出口为 %s,浏览器出口为 %s——代理生效中。", backendIP, webViewIP)
		}
		return dp
	}
	if equal {
		dp.Conclusion = fmt.Sprintf("原生与浏览器出口一致(%s),无分流。", backendIP)
	} else {
		dp.Match = false
		dp.Severity = "bad"
		dp.Conclusion = fmt.Sprintf("原生程序出口(%s)与浏览器出口(%s)不一致,存在分流——部分本地程序未走代理,可能以真实 IP 访问。", backendIP, webViewIP)
	}
	return dp
}

// buildWebRTC 过滤出公网 WebRTC 候选,与出口锚点比对判定泄漏。
func buildWebRTC(b BrowserProbe, anchorIP string) WebRTCView {
	w := WebRTCView{Note: b.WebRTCNote}
	var pub []string
	for _, ip := range b.WebRTCIPs {
		if isPublicIP(ip) {
			pub = append(pub, ip)
		}
	}
	w.IPs = dedupStrings(pub)
	if anchorIP != "" {
		for _, ip := range w.IPs {
			if ip != anchorIP {
				w.Leak = true
				break
			}
		}
	}
	return w
}

// ---- helpers ----

func safeIP(fn func() (string, error)) (ip string, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("探测异常: %v", r)
		}
	}()
	return fn()
}

func safeProbe(fn func() (probeResult, error)) (res probeResult, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("探测异常: %v", r)
		}
	}()
	return fn()
}

func errStr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func sortSources(in []SourceStat) []SourceStat {
	order := map[string]int{"ipify": 0, "ifconfig.co": 1, "ipwho.is": 2, "ipapi.is": 3, "ipinfo.io": 4}
	out := make([]SourceStat, len(in))
	copy(out, in)
	sort.SliceStable(out, func(i, j int) bool { return order[out[i].Source] < order[out[j].Source] })
	return out
}
