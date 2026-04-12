//go:build windows

package forensic

import (
	"os/exec"
	"syscall"
)

func applyPlatformCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
