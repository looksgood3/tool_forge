package appsearch

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// TestDiagGPIcon_Online 诊断:为什么某些 App 的图标抽不到。
// 抓实时页面,定位目标包名叶子,打印离它最近的若干 play-lh URL 及其「父容器结构」,
// 看新结构下图标元组长什么样、被现有规则(方形/urlFreq==1/rating 关键词)挡在哪。
//
//	APPSEARCH_ONLINE=1 GP_KEYWORD=whatsapp GP_TARGET=com.whatsapp \
//	  go test ./backend/tools/appsearch -run TestDiagGPIcon_Online -v
func TestDiagGPIcon_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	kw := getenvDefault("GP_KEYWORD", "whatsapp")
	target := getenvDefault("GP_TARGET", "com.whatsapp")

	u := "https://play.google.com/store/search?q=" + kw + "&c=apps&hl=en&gl=us"
	client := &http.Client{Timeout: 20 * time.Second, Transport: &http.Transport{Proxy: nil}}
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, u, nil)
	req.Header.Set("User-Agent", defaultUA)
	req.Header.Set("Accept-Language", "en")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("请求失败: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	blobs := extractAFBlobs(string(body))
	var searchBlob string
	for _, b := range blobs {
		if strings.Contains(b.Data, "/store/apps/details") || strings.Contains(b.Data, `\/store\/apps\/details`) {
			searchBlob = b.Data
			break
		}
	}
	if searchBlob == "" {
		t.Fatal("未找到搜索 blob")
	}
	urlFreq := playLhURLFrequency(searchBlob)

	var v any
	if err := json.Unmarshal([]byte(searchBlob), &v); err != nil {
		t.Fatalf("blob 解析失败: %v", err)
	}

	// 目标包名叶子
	pkgs := walkCollectPkgLeaves(v)
	var tgt *leafRef
	for i := range pkgs {
		if pkgs[i].value == target {
			tgt = &pkgs[i]
			break
		}
	}
	if tgt == nil {
		t.Fatalf("没找到目标包名 %s(页面里有 %d 个包名)", target, len(pkgs))
	}

	// 所有 play-lh URL 叶子
	icons := walkCollectLeaves(v, func(s string) bool {
		return strings.Contains(s, gpIconHostFrag)
	})
	t.Logf("目标 %s,页面共 %d 个 play-lh URL", target, len(icons))

	// 按与目标的共同前缀(树上邻近度)排序,打印最近 4 个
	type scored struct {
		ref    leafRef
		prefix int
	}
	var ss []scored
	for _, ic := range icons {
		ss = append(ss, scored{ic, commonPrefixLen(tgt.path, ic.path)})
	}
	// 简单选最近的几个
	for k := 0; k < 4 && k < len(ss); k++ {
		best := k
		for j := k + 1; j < len(ss); j++ {
			if ss[j].prefix > ss[best].prefix {
				best = j
			}
		}
		ss[k], ss[best] = ss[best], ss[k]
		ic := ss[k]
		freqFull := urlFreq[ic.ref.value]             // 现有代码就是用整串查(可能查不到)
		freqBase := urlFreq[stripQuery(ic.ref.value)] // playLhURLFrequency 实际用的 key(base)
		t.Logf("  #%d prefix=%d freqFull=%d freqBase=%d url=%s", k, ic.prefix, freqFull, freqBase, trunc(ic.ref.value, 90))
		// 父容器结构(免得太长,截断)
		if n := len(ic.ref.path); n > 0 {
			if parent := ic.ref.path[n-1]; parent != nil {
				if jb, err := json.Marshal(parent); err == nil {
					t.Logf("     parent: %s", trunc(string(jb), 300))
				}
			}
			// 祖父也看看(图标元组常在更上一层)
			if n >= 2 {
				if jb, err := json.Marshal(ic.ref.path[n-2]); err == nil {
					t.Logf("     grand : %s", trunc(string(jb), 300))
				}
			}
		}
	}
}

func getenvDefault(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func stripQuery(s string) string {
	if i := strings.IndexByte(s, '='); i >= 0 {
		return s[:i]
	}
	return s
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
