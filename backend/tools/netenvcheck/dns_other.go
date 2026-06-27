//go:build !windows

package netenvcheck

import (
	"bufio"
	"os"
	"strings"
)

// localDNSServers 从 /etc/resolv.conf 读取 nameserver(macOS/Linux)。
func localDNSServers() ([]string, error) {
	f, err := os.Open("/etc/resolv.conf")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var servers []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if strings.HasPrefix(line, "nameserver") {
			servers = append(servers, strings.TrimSpace(strings.TrimPrefix(line, "nameserver")))
		}
	}
	return parseDNSLines(strings.Join(servers, "\n")), nil
}
