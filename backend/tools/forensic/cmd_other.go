//go:build !windows

package forensic

import "os/exec"

func applyPlatformCmd(cmd *exec.Cmd) {}
