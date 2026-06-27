package appsearch

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestDumpGooglePlayHTML_Online 抓当前 Google Play 搜索页原始 HTML 存到 testdata/,
// 供离线分析结构变化;同时跑一遍现有解析报告能抽出几条。需 TUN/代理能直连 play.google.com。
//
// 运行(在能直连 GP 的机器上,用项目要求的 Go 1.25.9):
//
//	APPSEARCH_ONLINE=1 go test ./backend/tools/appsearch -run TestDumpGooglePlayHTML_Online -v
//
// 可选自定义关键词:  GP_KEYWORD=whatsapp
func TestDumpGooglePlayHTML_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	kw := os.Getenv("GP_KEYWORD")
	if kw == "" {
		kw = "whatsapp"
	}
	u := "https://play.google.com/store/search?q=" + kw + "&c=apps&hl=en&gl=us"
	client := &http.Client{Timeout: 20 * time.Second, Transport: &http.Transport{Proxy: nil}}

	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, u, nil)
	req.Header.Set("User-Agent", defaultUA)
	req.Header.Set("Accept-Language", "en")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("请求失败(代理/TUN 没开?): %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if err := os.MkdirAll("testdata", 0o755); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join("testdata", "gp_"+kw+".html")
	if err := os.WriteFile(out, body, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Logf("HTTP %d,已写入 %s (%d bytes)", resp.StatusCode, out, len(body))

	// 顺带跑现有解析,看现在到底抽到几条
	items, perr := searchGooglePlay(context.Background(), client, kw, "us", "en")
	t.Logf("当前解析结果:%d 条,err=%v", len(items), perr)
	for i, it := range items {
		if i >= 5 {
			break
		}
		t.Logf("  [%d] %s | %s | icon=%s", i, it.PkgName, it.Name, trunc(it.Icon, 70))
	}
}
