//go:build !windows

package netenvcheck

import (
	"os"
	"strings"
)

// systemLanguage 从环境变量推断系统区域语言(如 zh_CN.UTF-8 → zh-CN),仅用于展示。
func systemLanguage() string {
	for _, key := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		v := os.Getenv(key)
		if v == "" || v == "C" || v == "POSIX" {
			continue
		}
		// zh_CN.UTF-8 → zh_CN → zh-CN
		if i := strings.IndexByte(v, '.'); i >= 0 {
			v = v[:i]
		}
		return strings.ReplaceAll(v, "_", "-")
	}
	return ""
}
