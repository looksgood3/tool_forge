package outlookmail

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"golang.org/x/net/proxy"
)

// httpClientCache 按代理 URL 缓存 *http.Client(同一代理只建一份连接池)
type httpClientCache struct {
	mu      sync.Mutex
	clients map[string]*http.Client
}

func newHTTPClientCache() *httpClientCache {
	return &httpClientCache{clients: make(map[string]*http.Client)}
}

// Get 按 proxyURL("" = 直连)返回 *http.Client;同一 key 复用。
func (c *httpClientCache) Get(proxyURL string) (*http.Client, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if existing, ok := c.clients[proxyURL]; ok {
		return existing, nil
	}
	httpc, err := buildHTTPClient(proxyURL)
	if err != nil {
		return nil, err
	}
	c.clients[proxyURL] = httpc
	return httpc, nil
}

// buildHTTPClient 构造一个 *http.Client。proxyURL 支持 http(s)://、socks5://。
func buildHTTPClient(proxyURL string) (*http.Client, error) {
	tr := &http.Transport{
		MaxIdleConns:        20,
		MaxIdleConnsPerHost: 4,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 15 * time.Second,
	}
	if proxyURL != "" {
		u, err := url.Parse(proxyURL)
		if err != nil {
			return nil, err
		}
		switch u.Scheme {
		case "http", "https":
			tr.Proxy = http.ProxyURL(u)
		case "socks5", "socks5h":
			var auth *proxy.Auth
			if u.User != nil {
				pw, _ := u.User.Password()
				auth = &proxy.Auth{User: u.User.Username(), Password: pw}
			}
			dialer, err := proxy.SOCKS5("tcp", u.Host, auth, proxy.Direct)
			if err != nil {
				return nil, err
			}
			tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
				if cd, ok := dialer.(proxy.ContextDialer); ok {
					return cd.DialContext(ctx, network, addr)
				}
				return dialer.Dial(network, addr)
			}
		default:
			return nil, errors.New("不支持的代理协议: " + u.Scheme)
		}
	}
	return &http.Client{Transport: tr, Timeout: 60 * time.Second}, nil
}

// imapDialer 返回适配 imap.go 的 dialer 闭包(可以走代理)
func imapDialer(proxyURL string) (func(ctx context.Context, network, addr string) (net.Conn, error), error) {
	if proxyURL == "" {
		var d net.Dialer
		return func(ctx context.Context, network, addr string) (net.Conn, error) {
			return d.DialContext(ctx, network, addr)
		}, nil
	}
	u, err := url.Parse(proxyURL)
	if err != nil {
		return nil, err
	}
	switch u.Scheme {
	case "socks5", "socks5h":
		var auth *proxy.Auth
		if u.User != nil {
			pw, _ := u.User.Password()
			auth = &proxy.Auth{User: u.User.Username(), Password: pw}
		}
		dialer, err := proxy.SOCKS5("tcp", u.Host, auth, proxy.Direct)
		if err != nil {
			return nil, err
		}
		return func(ctx context.Context, network, addr string) (net.Conn, error) {
			if cd, ok := dialer.(proxy.ContextDialer); ok {
				return cd.DialContext(ctx, network, addr)
			}
			return dialer.Dial(network, addr)
		}, nil
	case "http", "https":
		// IMAP over HTTP CONNECT: 简单实现,通过 proxy 发起 CONNECT host:port
		return func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialHTTPConnect(ctx, u, addr)
		}, nil
	default:
		return nil, errors.New("不支持的代理协议: " + u.Scheme)
	}
}

func dialHTTPConnect(ctx context.Context, proxyURL *url.URL, targetAddr string) (net.Conn, error) {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", proxyURL.Host)
	if err != nil {
		return nil, err
	}
	connectReq := "CONNECT " + targetAddr + " HTTP/1.1\r\nHost: " + targetAddr + "\r\n"
	if proxyURL.User != nil {
		// 简化:不内置 base64 auth,需要时再加
	}
	connectReq += "\r\n"
	if _, err := conn.Write([]byte(connectReq)); err != nil {
		_ = conn.Close()
		return nil, err
	}
	br := make([]byte, 4096)
	n, err := conn.Read(br)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	resp := string(br[:n])
	if !startsWith2xx(resp) {
		_ = conn.Close()
		return nil, errors.New("HTTP CONNECT 失败: " + firstLine(resp))
	}
	return conn, nil
}

func startsWith2xx(s string) bool {
	if len(s) < 12 {
		return false
	}
	return s[9] == '2'
}

func firstLine(s string) string {
	for i, c := range s {
		if c == '\r' || c == '\n' {
			return s[:i]
		}
	}
	return s
}
