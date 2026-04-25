package netscan

import (
	"fmt"
	"net"
	"strings"
	"sync"
	"time"
)

// ScanPorts 并发探测一组端口,返回每个端口是否开放
func ScanPorts(host string, ports []int, timeoutMs int) PortResult {
	host = strings.TrimSpace(host)
	if host == "" {
		return PortResult{Error: "host 不能为空"}
	}
	if len(ports) == 0 {
		return PortResult{Host: host, Error: "请提供端口"}
	}
	timeout := time.Duration(timeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 1500 * time.Millisecond
	}
	// 并发上限,防止本机做几千个 socket
	maxConcurrent := 32
	if len(ports) < maxConcurrent {
		maxConcurrent = len(ports)
	}
	sem := make(chan struct{}, maxConcurrent)
	results := make([]PortStatus, len(ports))
	var wg sync.WaitGroup
	for i, p := range ports {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx, port int) {
			defer wg.Done()
			defer func() { <-sem }()
			start := time.Now()
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, fmt.Sprint(port)), timeout)
			lat := int(time.Since(start).Milliseconds())
			if err != nil {
				results[idx] = PortStatus{Port: port, Open: false, Latency: lat, Error: errSummary(err)}
				return
			}
			conn.Close()
			results[idx] = PortStatus{Port: port, Open: true, Latency: lat}
		}(i, p)
	}
	wg.Wait()
	return PortResult{Host: host, Ports: results}
}

// errSummary 把网络错误压缩成短摘要,避免一长串"dial tcp..."
func errSummary(err error) string {
	s := err.Error()
	if strings.Contains(s, "i/o timeout") || strings.Contains(s, "deadline exceeded") {
		return "超时"
	}
	if strings.Contains(s, "connection refused") {
		return "拒绝连接"
	}
	if strings.Contains(s, "no such host") {
		return "DNS 解析失败"
	}
	if strings.Contains(s, "network is unreachable") {
		return "网络不可达"
	}
	return s
}
