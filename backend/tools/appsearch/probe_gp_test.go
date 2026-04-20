package appsearch

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"testing"
)

// TestProbeGooglePlay_Online 抓取 play.google.com/store/search 页面，
// 提取所有 AF_initDataCallback 块，打印包含搜索结果的 ds 编号。
// 仅在 APPSEARCH_ONLINE=1 时执行；用于 phase 3 开发期 reconnaissance。
func TestProbeGooglePlay_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, err := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	html := string(body)
	t.Logf("html len=%d", len(html))

	blobs := extractAFBlobs(html)
	t.Logf("found %d AF_initDataCallback blobs", len(blobs))
	for _, b := range blobs {
		hasWA := strings.Contains(b.Data, "com.whatsapp")
		hasMsg := strings.Contains(b.Data, "com.facebook.orca")
		hasTg := strings.Contains(b.Data, "org.telegram.messenger")
		t.Logf("  %s len=%d  whatsapp=%v messenger=%v telegram=%v",
			b.Key, len(b.Data), hasWA, hasMsg, hasTg)
		if hasWA && hasMsg {
			// 这是搜索结果 blob；pretty-print 头 5KB 看结构
			var v any
			if err := json.Unmarshal([]byte(b.Data), &v); err != nil {
				t.Logf("  JSON parse: %v", err)
				continue
			}
			pretty, _ := json.MarshalIndent(v, "", "  ")
			out := string(pretty)
			if len(out) > 6000 {
				out = out[:6000] + "\n...(truncated)"
			}
			t.Logf("\n%s\n", out)
		}
	}
}

// 快速断言：没被编译器投诉
var _ = fmt.Sprintf

// TestProbeGooglePlayShape_Online 扫描 ds:4 找 `/store/apps/details?id=<pkg>` 字符串位置，
// 打印每条附近的兄弟节点，确定 title / dev / rating 的固定相对路径。
func TestProbeGooglePlayShape_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	blobs := extractAFBlobs(string(body))
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	if ds4 == "" {
		t.Fatal("ds:4 not found")
	}
	var v any
	if err := json.Unmarshal([]byte(ds4), &v); err != nil {
		t.Fatalf("json: %v", err)
	}

	// 递归查找所有包含 "/store/apps/details?id=" 的叶子，打印其父数组
	hits := 0
	var walk func(node any, path []any)
	walk = func(node any, path []any) {
		switch x := node.(type) {
		case string:
			if strings.Contains(x, "/store/apps/details?id=") && hits < 5 {
				hits++
				t.Logf("\n=== hit #%d path=%v string=%q", hits, pathToString(path), x)
				// 找最近的数组祖先并打印
				for i := len(path) - 1; i >= 0; i-- {
					if arr, ok := path[i].([]any); ok {
						short := fmt.Sprintf("%v", arr)
						if len(short) > 400 {
							short = short[:400] + "..."
						}
						t.Logf("  parent[%d]=%s", i, short)
						break
					}
				}
			}
		case []any:
			for _, c := range x {
				walk(c, append(path, x))
			}
		case map[string]any:
			for _, c := range x {
				walk(c, append(path, x))
			}
		}
	}
	walk(v, nil)
	t.Logf("\ntotal /store/apps/details hits: %d", hits)
}

func pathToString(p []any) string {
	return fmt.Sprintf("depth=%d", len(p))
}

// TestProbeURLFreqCheck_Online 查某些可疑 hash 在 ds:4 原文里出现的真实次数
func TestProbeURLFreqCheck_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	blobs := extractAFBlobs(string(body))
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	// 可疑 URL hash 列表
	suspects := []string{
		"kBtGTjKuAMwshWKj",                   // 被误选给 w4b/orca/messaging
		"yDX4DPU-vJMsr88UpE1sf8QxW-rS5FEJX",  // 被误选给 telegram/signal
		"OA9DcLdOtGCWUESkn7Jbc5lBJuPrleroAw", // 被误选给 wechat/meet/viber
		"bYtqbOcTYOlgc6gqZ2rwb8lpt",          // 真 whatsapp icon
		"JfQNUnohpuq5IP65WN9C109Vj",          // 真 orca icon (没被选上)
	}
	for _, h := range suspects {
		countRaw := strings.Count(ds4, h)
		// unescape 扫
		countUn := strings.Count(strings.ReplaceAll(ds4, `\/`, "/"), h)
		t.Logf("  %s...  raw=%d unescaped=%d", h, countRaw, countUn)
	}
}

// TestProbeAllIconDims_Online 对所有 20 条搜索结果的真实 icon URL（从 HTML 提出），
// 反查它们在 ds:4 里 image tuple 的 [W,H] 分布，看 icon 尺寸规律
func TestProbeAllIconDims_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	html := string(body)

	imgRe := regexp.MustCompile(`<img src="https://play-lh\.googleusercontent\.com/([A-Za-z0-9_-]{16,})=s\d+`)
	iconHashes := map[string]bool{}
	for _, m := range imgRe.FindAllStringSubmatch(html, -1) {
		iconHashes[m[1]] = true
	}

	blobs := extractAFBlobs(html)
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	var v any
	_ = json.Unmarshal([]byte(ds4), &v)

	// 对每个真 icon hash，找它所在的 image tuple 的 W/H
	type dim struct{ w, h float64 }
	type hit struct {
		hash string
		dims []dim
	}
	var hits []hit
	for h := range iconHashes {
		hh := hit{hash: h}
		var walk func(n any)
		walk = func(n any) {
			if arr, ok := n.([]any); ok {
				if len(arr) >= 4 {
					if urlT, ok := arr[3].([]any); ok && len(urlT) >= 3 {
						if urlStr, ok := urlT[2].(string); ok {
							if strings.Contains(urlStr, h) {
								if d, ok := arr[2].([]any); ok && len(d) == 2 {
									w, _ := d[0].(float64)
									hh2, _ := d[1].(float64)
									hh.dims = append(hh.dims, dim{w, hh2})
								}
							}
						}
					}
				}
				for _, c := range arr {
					walk(c)
				}
			}
		}
		walk(v)
		hits = append(hits, hh)
	}
	for _, hh := range hits {
		t.Logf("  %s...  dims=%v", hh.hash[:20], hh.dims)
	}
}

// TestProbeFindIconTuple_Online 对 com.whatsapp，在 ds:4 里找 bYtqbOc... 那个真图标，
// 反查它所在的 image tuple [W,H] 值是多少
func TestProbeFindIconTuple_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	blobs := extractAFBlobs(string(body))
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	var v any
	_ = json.Unmarshal([]byte(ds4), &v)

	wantHash := "bYtqbOcTYOlgc6gqZ2rwb8lpt"
	// 找所有 image tuple [null, 2, [W,H], [null, null, URL]]
	// 以及 WhatsApp 当前错选的 MUUkZ 对应尺寸
	wrongHash := "MUUkZ_-u8DS3Me"
	var walk func(n any)
	walk = func(n any) {
		if arr, ok := n.([]any); ok {
			if len(arr) >= 4 {
				if dim, ok := arr[2].([]any); ok && len(dim) == 2 {
					if urlTuple, ok := arr[3].([]any); ok && len(urlTuple) >= 3 {
						if urlStr, ok := urlTuple[2].(string); ok {
							for _, target := range []string{wantHash, wrongHash} {
								if strings.Contains(urlStr, target) {
									t.Logf("  url=%s\n    dim=%v arr[0]=%v arr[1]=%v",
										urlStr[:80]+"...", dim, arr[0], arr[1])
								}
							}
						}
					}
				}
			}
			for _, c := range arr {
				walk(c)
			}
		}
	}
	walk(v)
}

// TestProbeCheckIconInDS4_Online 验证 ds:4 和 HTML 中 app icon URL 的覆盖情况
func TestProbeCheckIconInDS4_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	html := string(body)
	// HTML 里肯定有 WhatsApp 真图标 URL（img src，带 =s64 后缀）
	// 提所有 <img src="https://play-lh.googleusercontent.com/XXX=s64" 的 XXX hash
	imgRe := regexp.MustCompile(`<img src="https://play-lh\.googleusercontent\.com/([A-Za-z0-9_-]{16,})=s\d+`)
	iconHashesInHTML := map[string]bool{}
	for _, m := range imgRe.FindAllStringSubmatch(html, -1) {
		iconHashesInHTML[m[1]] = true
	}
	t.Logf("icon hashes in HTML <img src> with =s<N>: %d", len(iconHashesInHTML))
	// 现在查这些 hash 是否在 ds:4 JSON 里
	blobs := extractAFBlobs(html)
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	in := 0
	out := 0
	for h := range iconHashesInHTML {
		if strings.Contains(ds4, h) {
			in++
		} else {
			out++
		}
	}
	t.Logf("icon hashes in ds:4: %d (%d not found)", in, out)

	// 随便列 5 个示例
	cnt := 0
	for h := range iconHashesInHTML {
		inDs4 := strings.Contains(ds4, h)
		t.Logf("  %s  in ds:4=%v", h[:30]+"...", inDs4)
		cnt++
		if cnt >= 10 {
			break
		}
	}
}

// TestProbeGooglePlayIconInJSON_Online 把 ds:4 里所有 play-lh 图片 URL 取出来，
// 看哪个是 WhatsApp 真图标（参考 HTML 里的 =s64 suffix 那个，URL hash 已知）
func TestProbeGooglePlayIconInJSON_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	blobs := extractAFBlobs(string(body))
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	// 找 ds:4 JSON 里所有 play-lh URL，打印 hash 前缀
	urlRe := regexp.MustCompile(`https://play-lh\.googleusercontent\.com/([A-Za-z0-9_-]{16,})`)
	seen := map[string]int{}
	for _, m := range urlRe.FindAllStringSubmatch(ds4, -1) {
		key := m[1]
		if len(key) > 30 {
			key = key[:30] + "..."
		}
		seen[key]++
	}
	t.Logf("distinct play-lh URLs in ds:4: %d", len(seen))
	type kv struct {
		k string
		n int
	}
	arr := []kv{}
	for k, n := range seen {
		arr = append(arr, kv{k, n})
	}
	for i := 1; i < len(arr); i++ {
		for j := i; j > 0 && arr[j].n > arr[j-1].n; j-- {
			arr[j], arr[j-1] = arr[j-1], arr[j]
		}
	}
	for i, e := range arr {
		if i >= 15 {
			break
		}
		t.Logf("  %s  x%d", e.k, e.n)
	}
}

// TestProbeGooglePlayIcon_Online 找 com.whatsapp 附近所有 play-lh 图片 URL，
// 看 App 真正图标 vs Everyone 分级徽章 vs 其他图的区别
func TestProbeGooglePlayIcon_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	html := string(body)
	// 先找所有 play-lh URL 及其前后 80 字节
	allRe := regexp.MustCompile(`"(https://play-lh[^"]{10,200})"`)
	matches := allRe.FindAllStringSubmatchIndex(html, -1)
	t.Logf("total play-lh URLs in HTML: %d", len(matches))

	// 分类：找每个 URL 在 HTML 里前 120 字节的文本作为"上下文"
	// 看哪些 URL 旁边有 "Everyone" / "Teen" / rating 关键词
	counts := map[string]int{}
	for i, m := range matches[:min(len(matches), 40)] {
		urlStart := m[2]
		start := urlStart - 120
		if start < 0 {
			start = 0
		}
		ctx := html[start:urlStart]
		tag := "icon?"
		for _, kw := range []string{"Everyone", "Teen", "Mature", "\"Users Interact\"", "IARC", "rating"} {
			if strings.Contains(ctx, kw) {
				tag = "RATING-BADGE:" + kw
				break
			}
		}
		for _, kw := range []string{"screenshot", "Screenshot"} {
			if strings.Contains(ctx, kw) {
				tag = "screenshot"
			}
		}
		if i < 10 {
			// 截 URL 最后 40 字节看 fingerprint
			url := html[m[2]:m[3]]
			short := url
			if len(short) > 60 {
				short = "..." + short[len(short)-60:]
			}
			t.Logf("  [%d] %s   ctx-tail=%q  url=%s", i, tag, ctx[len(ctx)-50:], short)
		}
		counts[tag]++
	}
	t.Logf("summary: %+v", counts)
}

// TestProbeGooglePlayURLCount_Online 扫所有含 "?id=" 的 URL，提 pkgName 去重
func TestProbeGooglePlayURLCount_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	blobs := extractAFBlobs(string(body))
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}

	// ds4 is raw JSON text — slashes appear as \/; match on unescaped decoded strings instead
	var v any
	_ = json.Unmarshal([]byte(ds4), &v)
	urlRe := regexp.MustCompile(`/store/apps/details\?id=([a-zA-Z0-9_.]+)`)
	seen := map[string]int{}
	var walk func(n any)
	walk = func(n any) {
		switch x := n.(type) {
		case string:
			for _, m := range urlRe.FindAllStringSubmatch(x, -1) {
				seen[m[1]]++
			}
		case []any:
			for _, c := range x {
				walk(c)
			}
		case map[string]any:
			for _, c := range x {
				walk(c)
			}
		}
	}
	walk(v)
	t.Logf("distinct pkg via URL walk: %d", len(seen))
	for k, n := range seen {
		t.Logf("  %s x%d", k, n)
	}
}

// TestProbeGooglePlayCardTree_Online 找 com.whatsapp 所在 URL 字符串的 3 层祖先，
// 打印整颗子树看能不能抽出 title/dev/rating/icon
func TestProbeGooglePlayCardTree_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	blobs := extractAFBlobs(string(body))
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	var v any
	_ = json.Unmarshal([]byte(ds4), &v)

	target := "/store/apps/details?id=com.whatsapp"
	var walk func(n any, anc []any)
	walk = func(n any, anc []any) {
		switch x := n.(type) {
		case string:
			if x == target {
				for back := 0; back <= 6; back++ {
					if len(anc) < back+1 {
						break
					}
					parent := anc[len(anc)-1-back]
					pretty, _ := json.Marshal(parent)
					s := string(pretty)
					title := "(none)"
					if arr, ok := parent.([]any); ok {
						title = fmt.Sprintf("len=%d", len(arr))
					}
					if len(s) > 800 {
						s = s[:800] + "...(cut)"
					}
					t.Logf("\n  ANC[-%d] %s\n  %s", back, title, s)
				}
			}
		case []any:
			for _, c := range x {
				walk(c, append(anc, x))
			}
		}
	}
	walk(v, nil)
}

// TestProbeGooglePlayCardShape_Online 对 com.whatsapp 这一条，
// 把它祖先路径上的各层父数组都 dump 出来，看哪层是"app 卡片"
func TestProbeGooglePlayCardShape_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	blobs := extractAFBlobs(string(body))
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	var v any
	_ = json.Unmarshal([]byte(ds4), &v)

	var found bool
	var walk func(node any, ancestors []any)
	walk = func(node any, ancestors []any) {
		if found {
			return
		}
		switch x := node.(type) {
		case string:
			if x == "com.whatsapp" {
				found = true
				t.Logf("found 'com.whatsapp' at depth=%d", len(ancestors))
				// 打印各层祖先数组的长度和首个字符串元素
				for i, a := range ancestors {
					if arr, ok := a.([]any); ok {
						firstStr := ""
						for _, e := range arr {
							if s, ok := e.(string); ok && firstStr == "" {
								firstStr = s
								break
							}
						}
						t.Logf("  anc[%d] array len=%d firstStr=%q", i, len(arr), firstStr)
					}
				}
				// 打印最近 3 层的内容（JSON pretty）
				for i := len(ancestors) - 1; i >= 0 && i >= len(ancestors)-4; i-- {
					pretty, _ := json.Marshal(ancestors[i])
					s := string(pretty)
					if len(s) > 1500 {
						s = s[:1500] + "...(cut)"
					}
					t.Logf("\n  LAYER[%d]: %s", i, s)
				}
			}
		case []any:
			for _, c := range x {
				walk(c, append(ancestors, x))
			}
		}
	}
	walk(v, nil)
}

// TestProbeGooglePlayPackages_Online 遍历 ds:4，找所有看起来像 pkgName 的字符串
// 并统计位置/上下文，看能不能认出"搜索结果列表"的形状。
func TestProbeGooglePlayPackages_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	c := &http.Client{Transport: &http.Transport{Proxy: nil}}
	r, _ := c.Get("https://play.google.com/store/search?q=whatsapp&c=apps&hl=en&gl=us")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	blobs := extractAFBlobs(string(body))
	var ds4 string
	for _, b := range blobs {
		if b.Key == "ds:4" {
			ds4 = b.Data
			break
		}
	}
	var v any
	_ = json.Unmarshal([]byte(ds4), &v)

	pkgRe := regexp.MustCompile(`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$`)
	seen := map[string]int{}
	var walk func(node any)
	walk = func(node any) {
		switch x := node.(type) {
		case string:
			if pkgRe.MatchString(x) && len(x) < 80 {
				seen[x]++
			}
		case []any:
			for _, c := range x {
				walk(c)
			}
		case map[string]any:
			for _, c := range x {
				walk(c)
			}
		}
	}
	walk(v)
	t.Logf("found %d distinct pkg-like strings", len(seen))
	// print top 30 sorted by count
	type kv struct {
		k string
		n int
	}
	arr := make([]kv, 0, len(seen))
	for k, n := range seen {
		arr = append(arr, kv{k, n})
	}
	// sort by count desc
	for i := 1; i < len(arr); i++ {
		for j := i; j > 0 && arr[j].n > arr[j-1].n; j-- {
			arr[j], arr[j-1] = arr[j-1], arr[j]
		}
	}
	for i, e := range arr {
		if i >= 30 {
			break
		}
		t.Logf("  %s  x%d", e.k, e.n)
	}
}
