package netscan

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"strings"
	"time"
)

// CheckSSL 连到 host:port,跳过验签拿全证书链,然后单独算"系统根能否验通"和"hostname 是否匹配"
func CheckSSL(host string, port int, timeoutMs int) SSLResult {
	if host == "" {
		return SSLResult{Error: "host 不能为空"}
	}
	if port <= 0 {
		port = 443
	}
	timeout := time.Duration(timeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	addr := net.JoinHostPort(host, fmt.Sprint(port))
	dialer := &net.Dialer{Timeout: timeout}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: true, // 我们想看到坏证书的细节
	})
	if err != nil {
		return SSLResult{Host: host, Port: port, Error: err.Error()}
	}
	defer conn.Close()

	state := conn.ConnectionState()
	r := SSLResult{
		Host:        host,
		Port:        port,
		Protocol:    tlsVersionName(state.Version),
		CipherSuite: tls.CipherSuiteName(state.CipherSuite),
	}
	for _, c := range state.PeerCertificates {
		r.Chain = append(r.Chain, certToInfo(c))
	}
	// 单独验链 + hostname
	if len(state.PeerCertificates) > 0 {
		leaf := state.PeerCertificates[0]
		opts := x509.VerifyOptions{
			DNSName:       host,
			Intermediates: x509.NewCertPool(),
			CurrentTime:   time.Now(),
		}
		for _, c := range state.PeerCertificates[1:] {
			opts.Intermediates.AddCert(c)
		}
		if _, err := leaf.Verify(opts); err == nil {
			r.ChainValid = true
			r.HostnameOK = true
		} else {
			// 再试一次仅校验 hostname
			r.HostnameOK = leaf.VerifyHostname(host) == nil
			// 链是否有效:跳过 hostname 重新走一次
			opts.DNSName = ""
			if _, err := leaf.Verify(opts); err == nil {
				r.ChainValid = true
			}
		}
	}
	return r
}

func certToInfo(c *x509.Certificate) SSLCertificate {
	ips := make([]string, 0, len(c.IPAddresses))
	for _, ip := range c.IPAddresses {
		ips = append(ips, ip.String())
	}
	days := int(time.Until(c.NotAfter).Hours() / 24)
	return SSLCertificate{
		Subject:            c.Subject.String(),
		Issuer:             c.Issuer.String(),
		CommonName:         c.Subject.CommonName,
		NotBefore:          c.NotBefore.Format(time.RFC3339),
		NotAfter:           c.NotAfter.Format(time.RFC3339),
		DaysRemaining:      days,
		SerialNumber:       formatSerial(c.SerialNumber.Bytes()),
		SignatureAlgorithm: c.SignatureAlgorithm.String(),
		PublicKeyAlgorithm: c.PublicKeyAlgorithm.String(),
		DNSNames:           append([]string(nil), c.DNSNames...),
		IPAddresses:        ips,
		IsCA:               c.IsCA,
		Version:            c.Version,
	}
}

func formatSerial(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	parts := make([]string, len(b))
	for i, x := range b {
		parts[i] = fmt.Sprintf("%02x", x)
	}
	return strings.Join(parts, ":")
}

func tlsVersionName(v uint16) string {
	switch v {
	case tls.VersionSSL30:
		return "SSL 3.0"
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	}
	return fmt.Sprintf("0x%04x", v)
}
