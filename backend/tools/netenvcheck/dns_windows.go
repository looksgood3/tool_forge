//go:build windows

package netenvcheck

import (
	"os/exec"
	"syscall"
)

// localDNSServers 读取本机配置的 IPv4 DNS 服务器。
// 用 PowerShell 的 Get-DnsClientServerAddress,跨语言环境稳定(不依赖 ipconfig 的本地化字段)。
func localDNSServers() ([]string, error) {
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command",
		"Get-DnsClientServerAddress -AddressFamily IPv4 | Select-Object -ExpandProperty ServerAddresses")
	// Wails 是 GUI 子系统,隐藏子进程黑框
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	return parseDNSLines(string(out)), nil
}
