package netenvcheck

import "net"

// isPrivateIP 判断是否为私网/保留地址(LAN、回环、链路本地、CGNAT 等)。
func isPrivateIP(s string) bool {
	ip := net.ParseIP(s)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsPrivate() || ip.IsUnspecified() {
		return true
	}
	// 100.64.0.0/10 (CGNAT)
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return true
		}
	}
	return false
}

// isPublicIP 是合法且非私网的 IP。
func isPublicIP(s string) bool {
	ip := net.ParseIP(s)
	return ip != nil && !isPrivateIP(s)
}

// dedupStrings 去重并保持顺序,跳过空串。
func dedupStrings(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}
