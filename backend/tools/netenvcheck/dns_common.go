package netenvcheck

import "strings"

// parseDNSLines 把命令输出按行拆成 DNS 服务器列表,去重、跳过空行与回环。
func parseDNSLines(out string) []string {
	var servers []string
	for _, line := range strings.Split(out, "\n") {
		s := strings.TrimSpace(line)
		if s == "" || s == "127.0.0.1" || s == "::1" {
			continue
		}
		servers = append(servers, s)
	}
	return dedupStrings(servers)
}

// analyzeDNS 基于本机 DNS 配置给出泄漏判定(启发式)。
//
// 注意:完整的 DNS 泄漏检测需要受控权威服务器,这里仅凭本机配置做保守判断——
// 若解析器指向 LAN/网关,说明解析很可能交给本地 ISP,易暴露真实地理位置。
func analyzeDNS(servers []string) DNSInfo {
	info := DNSInfo{LocalServers: servers}
	if len(servers) == 0 {
		info.Note = "未能读取到本机 DNS 配置"
		return info
	}
	hasPrivate := false
	for _, s := range servers {
		if isPrivateIP(s) {
			hasPrivate = true
			break
		}
	}
	if hasPrivate {
		info.Leak = true
		info.Note = "DNS 指向本地路由/网关,解析很可能由本地 ISP 完成,会暴露真实地理位置。建议在代理软件中开启「DNS 走代理」或改用 DoH(如 1.1.1.1 / 8.8.8.8)。"
	} else {
		info.Note = "DNS 指向公共解析器,相对安全;但解析流量是否真的走代理仍取决于代理软件配置。"
	}
	return info
}
