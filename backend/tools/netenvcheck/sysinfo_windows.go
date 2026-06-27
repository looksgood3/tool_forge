//go:build windows

package netenvcheck

import (
	"os/exec"
	"strings"
	"syscall"
)

// systemLanguage 读取系统当前区域语言(如 zh-CN),仅用于展示。
func systemLanguage() string {
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", "(Get-Culture).Name")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
