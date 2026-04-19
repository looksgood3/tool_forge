//go:build windows

package envscan

import (
	"os/exec"
	"syscall"
)

// applyPlatformCmd 让子进程不弹出 console 窗口。
// Wails 是 GUI 子系统,不设这个 .cmd 类 shim(npm/pnpm/claude 等)会闪黑框,
// 严重时还会挂住 stdout 导致 stdout/stderr 读不回来。
func applyPlatformCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
