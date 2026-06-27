package netenvcheck

import (
	"fmt"
	"math"
	"runtime"
	"strings"
	"time"
)

// basePoints 各扣分项在「均衡」档下的基准扣分。
var basePoints = map[string]int{
	"tor":               30,
	"datacenter":        25,
	"proxy":             20,
	"abuser":            20,
	"vpn":               15,
	"webrtc_leak":       15,
	"dualpath_mismatch": 15,
	"dns_leak":          10,
	"tz_mismatch":       8,
	"lang_mismatch":     5,
	"ua_inconsistent":   3,
}

// scaled 按预设缩放扣分:严格 ×1.4,宽松 ×0.6,均衡不变。
func scaled(base int, p Preset) int {
	switch p {
	case PresetStrict:
		return int(math.Round(float64(base) * 1.4))
	case PresetLenient:
		return int(math.Round(float64(base) * 0.6))
	default:
		return base
	}
}

func grade(score int) string {
	switch {
	case score >= 85:
		return "优秀"
	case score >= 70:
		return "良好"
	case score >= 50:
		return "一般"
	default:
		return "高风险"
	}
}

// ---------------- 一致性分析 ----------------

// buildConsistency 比对系统/浏览器时区、浏览器语言、UA 与 IP 归属。
func buildConsistency(in Input, geo GeoInfo) Consistency {
	c := Consistency{
		BrowserTimezone: in.Browser.Timezone,
		IPTimezone:      geo.Timezone,
		SystemLanguage:  systemLanguage(),
		BrowserLanguage: in.Browser.Language,
		AcceptLanguage:  in.Browser.AcceptLanguage,
		IPCountry:       geo.CountryCode,
		UserAgent:       in.Browser.UserAgent,
	}

	_, sysOffSec := time.Now().Zone()
	c.SystemOffset = formatOffset(sysOffSec)

	// 时区:用「偏移量」比对(反风控真正看的是偏移)。优先浏览器时区,缺失则退回系统时区。
	ipOff, ipOK := tzOffset(geo.Timezone)
	if !ipOK {
		c.TimezoneMatch = true // IP 没给时区,无法判定,不扣分
	} else if brOff, brOK := tzOffset(in.Browser.Timezone); brOK {
		c.TimezoneMatch = brOff == ipOff
		if !c.TimezoneMatch {
			c.Notes = append(c.Notes, fmt.Sprintf("浏览器时区 %s(%s)与 IP 归属时区 %s(%s)不一致",
				in.Browser.Timezone, formatOffset(brOff), geo.Timezone, formatOffset(ipOff)))
		}
	} else {
		c.TimezoneMatch = sysOffSec == ipOff
		if !c.TimezoneMatch {
			c.Notes = append(c.Notes, fmt.Sprintf("系统时区(%s)与 IP 归属时区 %s(%s)不一致",
				c.SystemOffset, geo.Timezone, formatOffset(ipOff)))
		}
	}

	// 语言:浏览器语言带地区子标签时,与 IP 国家比对。
	region := langRegion(in.Browser.Language)
	if region == "" || geo.CountryCode == "" {
		c.LanguageMatch = true // 无地区子标签或无 IP 国家,无法判定
	} else {
		c.LanguageMatch = strings.EqualFold(region, geo.CountryCode)
		if !c.LanguageMatch {
			c.Notes = append(c.Notes, fmt.Sprintf("浏览器语言 %s 指向地区 %s,与 IP 国家 %s 不一致",
				in.Browser.Language, region, geo.CountryCode))
		}
	}

	// UA:运行在本机平台,UA 不应宣称别的系统。
	c.UAConsistent = true
	if ua := in.Browser.UserAgent; ua != "" {
		if runtime.GOOS == "windows" && !strings.Contains(ua, "Windows") {
			c.UAConsistent = false
			c.Notes = append(c.Notes, "User-Agent 未包含 Windows,与运行平台矛盾(可能装了伪造 UA 的插件)")
		}
	}
	return c
}

func tzOffset(name string) (int, bool) {
	if name == "" {
		return 0, false
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return 0, false
	}
	_, off := time.Now().In(loc).Zone()
	return off, true
}

func formatOffset(sec int) string {
	sign := "+"
	if sec < 0 {
		sign = "-"
		sec = -sec
	}
	return fmt.Sprintf("%s%02d:%02d", sign, sec/3600, (sec%3600)/60)
}

// langRegion 取语言标签里的两字母地区子标签(zh-CN→CN, zh-Hans-CN→CN);没有则返回空。
func langRegion(lang string) string {
	parts := strings.Split(lang, "-")
	for i := len(parts) - 1; i >= 1; i-- {
		if len(parts[i]) == 2 {
			return strings.ToUpper(parts[i])
		}
	}
	return ""
}

// ---------------- 评分 ----------------

// computeScore 根据 Report 已填好的探测数据,计算扣分项、总分、等级与修复建议。
func computeScore(rep *Report) {
	p := rep.Preset
	var deductions []ScoreItem
	add := func(key, detail, confidence string) {
		pts := scaled(basePoints[key], p)
		deductions = append(deductions, ScoreItem{
			Key:        key,
			Title:      deductionTitle(key),
			Points:     pts,
			Detail:     detail,
			Confidence: confidence,
		})
	}

	risk := rep.Backend.Risk
	conf := riskConfidence(risk.Sources)
	if risk.IsTor {
		add("tor", "出口被识别为 Tor 出口节点", conf)
	}
	if risk.IsDatacenter {
		d := "出口为机房/托管 IP"
		if risk.Hosting != "" {
			d += "(" + risk.Hosting + ")"
		}
		add("datacenter", d, conf)
	}
	if risk.IsProxy {
		add("proxy", "出口被识别为代理", conf)
	}
	if risk.IsAbuser {
		add("abuser", "IP 出现在滥用/黑名单记录中", conf)
	}
	if risk.IsVPN {
		add("vpn", "出口被识别为 VPN", conf)
	}
	if rep.WebRTC.Leak {
		add("webrtc_leak", "WebRTC 暴露了与出口不一致的公网 IP:"+strings.Join(rep.WebRTC.IPs, ", "), "高")
	}
	if !rep.DualPath.Match && rep.DualPath.Severity == "bad" {
		add("dualpath_mismatch", rep.DualPath.Conclusion, "高")
	}
	if rep.DNS.Leak {
		add("dns_leak", rep.DNS.Note, "中")
	}
	if !rep.Consistency.TimezoneMatch {
		add("tz_mismatch", consistencyDetail(rep.Consistency.Notes, "时区"), "高")
	}
	if !rep.Consistency.LanguageMatch {
		add("lang_mismatch", consistencyDetail(rep.Consistency.Notes, "语言"), "中")
	}
	if !rep.Consistency.UAConsistent {
		add("ua_inconsistent", consistencyDetail(rep.Consistency.Notes, "User-Agent"), "中")
	}

	total := 0
	for _, d := range deductions {
		total += d.Points
	}
	score := 100 - total
	if score < 0 {
		score = 0
	}
	rep.Deductions = deductions
	rep.Score = score
	rep.Grade = grade(score)
	rep.Remediation = buildRemediation(deductions)
}

func riskConfidence(sources []string) string {
	for _, s := range sources {
		if s == "ipapi.is" {
			return "高"
		}
	}
	if len(sources) >= 2 {
		return "高"
	}
	return "中"
}

func deductionTitle(key string) string {
	switch key {
	case "tor":
		return "Tor 出口节点"
	case "datacenter":
		return "机房 / 托管 IP"
	case "proxy":
		return "被识别为代理"
	case "abuser":
		return "滥用 / 黑名单记录"
	case "vpn":
		return "被识别为 VPN"
	case "webrtc_leak":
		return "WebRTC IP 泄漏"
	case "dualpath_mismatch":
		return "原生与浏览器出口不一致(分流)"
	case "dns_leak":
		return "DNS 泄漏风险"
	case "tz_mismatch":
		return "时区与 IP 归属不一致"
	case "lang_mismatch":
		return "语言与 IP 国家不一致"
	case "ua_inconsistent":
		return "User-Agent 与平台矛盾"
	}
	return key
}

// consistencyDetail 从一致性 notes 里挑出与某主题相关的一句作为扣分明细。
func consistencyDetail(notes []string, topic string) string {
	for _, n := range notes {
		if strings.Contains(n, topic) {
			return n
		}
	}
	return topic + "存在不一致"
}
