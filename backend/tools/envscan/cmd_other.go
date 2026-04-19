//go:build !windows

package envscan

import "os/exec"

func applyPlatformCmd(cmd *exec.Cmd) {}
