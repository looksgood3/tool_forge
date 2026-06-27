package netenvcheck

// buildRemediation 把命中的扣分项转成修复建议(按影响分从高到低)。
// 只给方案与可复制命令/系统设置入口,不自动执行任何会改动网络的操作。
func buildRemediation(deductions []ScoreItem) []Remediation {
	out := make([]Remediation, 0, len(deductions))
	for _, d := range deductions {
		r := remediationFor(d.Key)
		r.Impact = d.Points
		r.Severity = severityForPoints(d.Points)
		out = append(out, r)
	}
	// 影响分降序(稳定插入排序,数量很小)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j].Impact > out[j-1].Impact; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func severityForPoints(pts int) string {
	switch {
	case pts >= 20:
		return "high"
	case pts >= 10:
		return "medium"
	default:
		return "low"
	}
}

func remediationFor(key string) Remediation {
	switch key {
	case "tor":
		return Remediation{Key: key, Title: "避免使用 Tor 出口", Steps: []string{
			"Tor 出口节点会被绝大多数服务直接判高风险,不要用 Tor 访问需要稳定身份的账号。",
			"切换为住宅(residential)代理或家庭宽带出口。",
		}}
	case "datacenter":
		return Remediation{Key: key, Title: "换用住宅 IP,避开机房出口", Steps: []string{
			"机房/云服务器 IP 极易被风控。优先使用住宅代理或家宽 IP。",
			"不要直接拿 VPS 公网 IP 访问需要干净身份的服务。",
		}}
	case "proxy":
		return Remediation{Key: key, Title: "降低代理特征", Steps: []string{
			"当前出口被识别为代理。换用更隐蔽的住宅代理,避免公共/数据中心代理段。",
			"确认代理节点未出现在公开代理列表中。",
		}}
	case "abuser":
		return Remediation{Key: key, Title: "更换被污染的 IP", Steps: []string{
			"该 IP 有滥用/黑名单记录,可能与他人共享了被污染的出口。",
			"更换干净节点;独享 IP 优于共享 IP。",
		}}
	case "vpn":
		return Remediation{Key: key, Title: "降低 VPN 特征", Steps: []string{
			"出口被识别为 VPN。商用 VPN 公共段命中率高,换用住宅代理更稳。",
		}}
	case "webrtc_leak":
		return Remediation{Key: key, Title: "封堵 WebRTC IP 泄漏", Steps: []string{
			"WebRTC 走 UDP 可绕过 HTTP 代理,暴露真实/非代理出口。",
			"开启 TUN/全局模式让 UDP 也走代理;或在浏览器禁用 WebRTC、安装 WebRTC 隔离扩展。",
		}}
	case "dualpath_mismatch":
		return Remediation{Key: key, Title: "统一原生与浏览器出口(消除分流)", Steps: []string{
			"原生程序流量与浏览器出口不一致,说明部分本地程序未走代理,可能以真实 IP 访问。",
			"在代理软件中改用 TUN / 全局模式,让所有程序流量都走代理。",
			"检查代理规则是否把某些域名/进程放成了直连。",
		}, SettingsURI: "ms-settings:network-proxy"}
	case "dns_leak":
		return Remediation{Key: key, Title: "让 DNS 走代理 / 改用 DoH", Steps: []string{
			"本机 DNS 指向本地路由/ISP,解析会暴露真实地理位置。",
			"在代理软件里开启「DNS 走代理 / fake-ip」,或把系统 DNS 改为可信公共解析器。",
		}, Command: "netsh interface ip set dns name=\"以太网\" static 1.1.1.1", SettingsURI: "ms-settings:network"}
	case "tz_mismatch":
		return Remediation{Key: key, Title: "对齐时区与出口归属", Steps: []string{
			"系统/浏览器时区与出口 IP 所在时区不一致,是常见的反风控信号。",
			"把系统时区调整为与出口 IP 一致(权衡日常使用习惯)。",
		}, SettingsURI: "ms-settings:dateandtime"}
	case "lang_mismatch":
		return Remediation{Key: key, Title: "对齐语言与出口国家", Steps: []string{
			"浏览器语言地区与出口 IP 国家不一致。",
			"视需要把浏览器/系统语言调整为与出口地区匹配(权衡使用习惯)。",
		}, SettingsURI: "ms-settings:regionlanguage"}
	case "ua_inconsistent":
		return Remediation{Key: key, Title: "修正 User-Agent", Steps: []string{
			"User-Agent 与运行平台矛盾,易被判定为自相矛盾的伪造指纹。",
			"卸载会篡改 UA 的浏览器插件,使用与真实平台一致的 UA。",
		}}
	}
	return Remediation{Key: key, Title: deductionTitle(key)}
}
