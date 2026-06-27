package llmproxy

import (
	"net/http"
	"strings"
)

// sensitiveHeaders 落盘前必须脱敏的头(小写匹配)。
var sensitiveHeaders = map[string]bool{
	"authorization":       true,
	"api-key":             true,
	"x-api-key":           true,
	"x-goog-api-key":      true,
	"openai-api-key":      true,
	"cookie":              true,
	"set-cookie":          true,
	"proxy-authorization": true,
}

// redactHeaders 把 http.Header 转成 map,并对敏感头打码(绝不存原始值)。
func redactHeaders(h http.Header) map[string]string {
	out := make(map[string]string, len(h))
	for k, vs := range h {
		v := strings.Join(vs, ", ")
		if sensitiveHeaders[strings.ToLower(k)] {
			v = maskSecret(v)
		}
		out[k] = v
	}
	return out
}

// maskSecret 保留可识别的前缀(如 Bearer)与尾部 4 位指纹,中间抹掉。
func maskSecret(s string) string {
	s = strings.TrimSpace(s)
	prefix := ""
	if len(s) >= 7 && strings.EqualFold(s[:7], "bearer ") {
		prefix = s[:7]
		s = strings.TrimSpace(s[7:])
	}
	if len(s) <= 6 {
		return prefix + "****"
	}
	return prefix + s[:3] + "…" + s[len(s)-4:]
}
