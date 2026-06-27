package appsearch

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"regexp"
	"strings"
)

// Google Play 没有官方搜索 API。这里抓搜索 / 详情页的 SSR HTML，
// 从 AF_initDataCallback 内嵌 JSON 字面量里提取结果。
//
// Google 的页面结构会不定期变化。这里用"URL 锚点 + 模式识别"的思路：
// 以 /store/apps/details?id=<pkg> 为锚定位每张 card，然后在 card 子树里靠
// 字符串模式（http vs 非 http、长度、特殊字符）抓 title / icon / installs，
// 避免写死会随版本变化的数字索引位置。

const (
	gpSearchURL = "https://play.google.com/store/search"
	gpDetailURL = "https://play.google.com/store/apps/details"
)

var (
	gpAFBlobRe     = regexp.MustCompile(`AF_initDataCallback\(\{key:\s*'(ds:\d+)',[^}]*?data:`)
	gpDetailURLRe  = regexp.MustCompile(`/store/apps/details\?id=([a-zA-Z0-9_.]+)`)
	gpInstallsRe   = regexp.MustCompile(`^[\d,]+\+?$`)
	gpHumanCountRe = regexp.MustCompile(`^\d+[KMB]\+?$`)
	// 看起来是 Android 包名的字符串：全小写+多个点，这种不会是 title
	gpPkgLikeRe    = regexp.MustCompile(`^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,}$`)
	gpIconHostFrag = "play-lh.googleusercontent.com"
	gpSupportHost  = "support.google.com"
)

type gpCard struct {
	PkgName  string
	Name     string
	Icon     string
	Installs string
}

// searchGooglePlay 搜索并返回结果。需要能直连 play.google.com（国内必须代理/TUN）。
func searchGooglePlay(ctx context.Context, client *http.Client, keyword, country, lang string) ([]SearchResultItem, error) {
	if country == "" {
		country = "us"
	}
	if lang == "" {
		lang = "en"
	}
	u := fmt.Sprintf("%s?q=%s&c=apps&hl=%s&gl=%s",
		gpSearchURL, urlQueryEscape(keyword), lang, country)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", defaultUA)
	req.Header.Set("Accept-Language", lang)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Google Play: http %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// 找包含搜索结果的 ds blob：有 `/store/apps/details?id=` 锚点的就是
	blobs := extractAFBlobs(string(body))
	var searchBlob string
	for _, b := range blobs {
		if strings.Contains(b.Data, `\/store\/apps\/details`) || strings.Contains(b.Data, "/store/apps/details") {
			searchBlob = b.Data
			break
		}
	}
	if searchBlob == "" {
		return nil, fmt.Errorf("Google Play: 未找到搜索结果 blob")
	}

	// 统计每个 play-lh URL 在原文里出现的次数：
	// 共享资源（Everyone 分级徽章、默认图标等）出现次数远多于独立 App 图标，
	// 用这个频次过滤掉共享资源。
	urlFreq := playLhURLFrequency(searchBlob)

	var v any
	if err := json.Unmarshal([]byte(searchBlob), &v); err != nil {
		return nil, fmt.Errorf("Google Play: blob JSON 解析失败: %w", err)
	}

	cards := collectGPSearchCards(v, urlFreq)
	items := make([]SearchResultItem, 0, len(cards))
	for _, c := range cards {
		items = append(items, SearchResultItem{
			Source:   SourceGooglePlay,
			Platform: PlatformAndroid,
			PkgName:  c.PkgName,
			Name:     c.Name,
			Icon:     c.Icon,
			Country:  country,
			Extra: map[string]string{
				"installs": c.Installs,
				"url":      fmt.Sprintf("%s?id=%s&hl=%s&gl=%s", gpDetailURL, c.PkgName, lang, country),
			},
		})
	}
	return items, nil
}

// collectGPSearchCards 策略：
//  1. 先扫出树里所有"看起来是 App 标题"的叶子，每条记 (title, ancestorPath)
//  2. 再扫出所有 /store/apps/details?id=<pkg> URL，每条记 (pkg, ancestorPath)
//  3. 对每个 pkg，在 titles 里找一个 ancestor 路径和它"最早共同祖先最深"的 title
//     —— 即两者在 JSON 树里最靠近的那个，就是这张 card 的 title
//  4. 同样方式匹配 icon（play-lh.googleusercontent.com）和 installs 字样
//
// 这种基于"树上邻近度"的匹配方式比"写死 N 层祖先"稳得多，因为 Google 改版通常
// 调整的是绝对层级而不是相对邻近关系。
func collectGPSearchCards(root any, urlFreq map[string]int) []gpCard {
	titles := walkCollectLeaves(root, func(s string) bool { return looksLikeTitle(s) })
	pkgs := walkCollectPkgLeaves(root)

	// 图标候选：分两桶，preferred ([0,0]) 先于 normal ([W,W]) 匹配
	iconsPreferred, iconsNormal := walkCollectIconLeaves(root, urlFreq)
	installs := walkCollectLeaves(root, func(s string) bool {
		return gpHumanCountRe.MatchString(s) || (gpInstallsRe.MatchString(s) && strings.Contains(s, "+"))
	})

	// 去重 pkg（保持首次出现顺序）
	seen := map[string]bool{}
	uniquePkgs := []leafRef{}
	for _, p := range pkgs {
		if seen[p.value] {
			continue
		}
		seen[p.value] = true
		uniquePkgs = append(uniquePkgs, p)
	}

	// 先用 preferred（[0,0] featured 真图标）做一对一，剩下的 pkg 再用 normal 兜底
	iconMap := uniqueAssign(uniquePkgs, iconsPreferred)
	leftPkgs := []leafRef{}
	leftIdx := []int{}
	for i, p := range uniquePkgs {
		if _, ok := iconMap[i]; !ok {
			leftPkgs = append(leftPkgs, p)
			leftIdx = append(leftIdx, i)
		}
	}
	if len(leftPkgs) > 0 {
		fallback := uniqueAssign(leftPkgs, iconsNormal)
		for j, realIdx := range leftIdx {
			if v, ok := fallback[j]; ok {
				iconMap[realIdx] = v
			}
		}
	}

	out := make([]gpCard, 0, len(uniquePkgs))
	for i, p := range uniquePkgs {
		c := gpCard{PkgName: p.value}
		// title / installs 用 nearest：这些候选很多且不脏，让多个 pkg 共选 OK
		if t := nearest(p, titles); t != nil && commonPrefixLen(p.path, t.path) >= 2 {
			c.Name = t.value
		}
		if in := nearest(p, installs); in != nil && commonPrefixLen(p.path, in.path) >= 2 {
			c.Installs = in.value
		}
		if ic, ok := iconMap[i]; ok {
			c.Icon = ic.value
		}
		out = append(out, c)
	}
	return out
}

// uniqueAssign 把 candidates 一对一分给 pkgs：按 (pkg, candidate) 对的 prefix 长度
// 从大到小贪心匹配，每个 pkg 和 candidate 都只用一次。要求 prefix >= 2 才算有效。
func uniqueAssign(pkgs, candidates []leafRef) map[int]leafRef {
	// 必须返回非 nil map:调用方会往返回值里写入(iconMap[idx]=v),
	// 候选为空时若返回 nil,写入会 panic "assignment to entry in nil map"。
	assign := map[int]leafRef{}
	if len(pkgs) == 0 || len(candidates) == 0 {
		return assign
	}
	type edge struct {
		p, c   int
		prefix int
	}
	edges := make([]edge, 0, len(pkgs)*len(candidates))
	for pi, p := range pkgs {
		for ci, c := range candidates {
			pl := commonPrefixLen(p.path, c.path)
			if pl >= 2 {
				edges = append(edges, edge{pi, ci, pl})
			}
		}
	}
	// 按 prefix 降序（稳定：同 prefix 时 pkg 小的先）
	for i := 1; i < len(edges); i++ {
		for j := i; j > 0; j-- {
			if edges[j].prefix > edges[j-1].prefix ||
				(edges[j].prefix == edges[j-1].prefix && edges[j].p < edges[j-1].p) {
				edges[j], edges[j-1] = edges[j-1], edges[j]
			} else {
				break
			}
		}
	}
	usedP := make(map[int]bool)
	usedC := make(map[int]bool)
	for _, e := range edges {
		if usedP[e.p] || usedC[e.c] {
			continue
		}
		usedP[e.p] = true
		usedC[e.c] = true
		assign[e.p] = candidates[e.c]
	}
	return assign
}

type leafRef struct {
	value string
	path  []any // ancestor nodes from root to parent (exclusive of the leaf itself)
}

// walkCollectLeaves 收集所有满足 pred 的字符串叶子及其祖先路径
func walkCollectLeaves(root any, pred func(string) bool) []leafRef {
	var out []leafRef
	var walk func(n any, anc []any)
	walk = func(n any, anc []any) {
		switch x := n.(type) {
		case string:
			if pred(x) {
				pathCopy := make([]any, len(anc))
				copy(pathCopy, anc)
				out = append(out, leafRef{value: x, path: pathCopy})
			}
		case []any:
			next := append(anc, x)
			for _, c := range x {
				walk(c, next)
			}
		case map[string]any:
			next := append(anc, x)
			for _, c := range x {
				walk(c, next)
			}
		}
	}
	walk(root, nil)
	return out
}

// walkCollectIconLeaves 专门找"看起来像 App 图标"的 URL，返回两个桶：
//
//	preferred: size 正好是 [0, 0] —— featured 卡的真图标（featured 卡里还混有 [W,W] 截图）
//	normal:    size 是其他方形 [W,W] —— 普通卡的真图标（[512,512] 为主）
//
// 共享资源（分级徽章等）通过频次和 rating keyword 过滤。
func walkCollectIconLeaves(root any, urlFreq map[string]int) (preferred, normal []leafRef) {

	// rating 关键词，出现在 parent 兄弟节点里就判定当前子树是评级信息
	ratingKW := []string{"Everyone", "Teen", "Mature", "IARC", "Users Interact"}

	var walk func(n any, anc []any)
	walk = func(n any, anc []any) {
		switch x := n.(type) {
		case []any:
			// 先递归下去
			next := append(anc, x)
			for _, c := range x {
				walk(c, next)
			}
			// 看当前节点是否是图像元组 [null, 2, [W,H], [null,null,URL]]
			// App icon 典型尺寸：普通卡 [512, 512]，featured 卡 [0, 0]，都是方形
			// 排除：feature graphic (非方形)、screenshot (常见 384x384/1080 等但在 ds:4 也是方形,
			// 靠频次和 rating keyword 区分)、rating pictogram (W==H 但频次很高)
			if len(x) >= 4 {
				if dim, ok := x[2].([]any); ok && len(dim) == 2 {
					w, okW := dim[0].(float64)
					h, okH := dim[1].(float64)
					if !okW || !okH {
						return
					}
					// 必须方形
					if w != h {
						return
					}
					// 取出 URL：[null, null, URL]
					urlTuple, ok := x[3].([]any)
					if !ok || len(urlTuple) < 3 {
						return
					}
					urlStr, ok := urlTuple[2].(string)
					if !ok {
						return
					}
					if !strings.Contains(urlStr, gpIconHostFrag) {
						return
					}
					// 不再用 urlFreq==1 过滤:GP 改版后热门 App 的图标会在多个卡片(相似推荐等)
					// 重复出现(freq 远大于 1),旧规则会把真图标全刷掉导致没图标。改为只靠
					// "方形 + 树上邻近度"选图标(见 collectGPSearchCards),这里仅挡掉过小的徽章像素图。
					if w > 0 && w < 32 {
						return
					}
					// 检查近邻是否有 rating 关键词
					if hasRatingKeyword(anc, ratingKW) {
						return
					}
					pathCopy := make([]any, len(anc))
					copy(pathCopy, anc)
					ref := leafRef{value: urlStr, path: pathCopy}
					if w == 0 {
						preferred = append(preferred, ref)
					} else {
						normal = append(normal, ref)
					}
				}
			}
		case map[string]any:
			next := append(anc, x)
			for _, c := range x {
				walk(c, next)
			}
		}
	}
	walk(root, nil)
	return preferred, normal
}

// hasRatingKeyword 检查 ancestor 路径上最近 2 层父数组里有无 rating 关键词
func hasRatingKeyword(anc []any, kws []string) bool {
	for i := len(anc) - 1; i >= 0 && i >= len(anc)-2; i-- {
		arr, ok := anc[i].([]any)
		if !ok {
			continue
		}
		for _, e := range arr {
			s, ok := e.(string)
			if !ok {
				continue
			}
			for _, kw := range kws {
				if s == kw {
					return true
				}
			}
		}
	}
	return false
}

// walkCollectPkgLeaves 和 walkCollectLeaves 类似，但 value 取 URL 里提取出的 pkgName
func walkCollectPkgLeaves(root any) []leafRef {
	var out []leafRef
	var walk func(n any, anc []any)
	walk = func(n any, anc []any) {
		switch x := n.(type) {
		case string:
			if m := gpDetailURLRe.FindStringSubmatch(x); len(m) == 2 {
				pathCopy := make([]any, len(anc))
				copy(pathCopy, anc)
				out = append(out, leafRef{value: m[1], path: pathCopy})
			}
		case []any:
			next := append(anc, x)
			for _, c := range x {
				walk(c, next)
			}
		case map[string]any:
			next := append(anc, x)
			for _, c := range x {
				walk(c, next)
			}
		}
	}
	walk(root, nil)
	return out
}

// nearest 在 candidates 里找与 target 最近（共同前缀最长）的一个
func nearest(target leafRef, candidates []leafRef) *leafRef {
	if len(candidates) == 0 {
		return nil
	}
	bestIdx := -1
	bestPrefix := -1
	for i := range candidates {
		p := commonPrefixLen(target.path, candidates[i].path)
		if p > bestPrefix {
			bestPrefix = p
			bestIdx = i
		}
	}
	if bestIdx < 0 {
		return nil
	}
	return &candidates[bestIdx]
}

// commonPrefixLen 比较两个 ancestor path（同节点实例才算相等）
func commonPrefixLen(a, b []any) int {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	for i := 0; i < n; i++ {
		if !sameNode(a[i], b[i]) {
			return i
		}
	}
	return n
}

// sameNode 判断两个路径节点是否是同一棵 JSON 树里的同一实例(引用相等)。
//
// 关键:绝不能对 a、b 直接用 ==。路径节点是容器(数组/对象),当两者动态类型都是
// map[string]any 时,a == b 会触发运行时 panic:
//
//	"comparing uncomparable type map[string]interface {}"
//
// 这正是"只勾 Google Play 搜索某些词整个 app 崩溃"的根因(裸 goroutine 里无 recover)。
// 因此这里按类型分派,只用引用相等比较 slice / map。
func sameNode(a, b any) bool {
	switch av := a.(type) {
	case []any:
		bv, ok := b.([]any)
		return ok && sliceHeaderEq(av, bv)
	case map[string]any:
		bv, ok := b.(map[string]any)
		return ok && mapHeaderEq(av, bv)
	default:
		// 路径节点只会是容器;其它类型一律视为不同,避免对不可比较类型用 ==
		return false
	}
}

// mapHeaderEq 判断两个 map 是否引用同一底层实例(map 是引用类型,同实例 → 同指针)
func mapHeaderEq(a, b map[string]any) bool {
	return reflect.ValueOf(a).Pointer() == reflect.ValueOf(b).Pointer()
}

// sliceHeaderEq 判断两个 []any 是否引用同一底层数组（同一位置 + 同长度）
func sliceHeaderEq(a, b []any) bool {
	if len(a) != len(b) || len(a) == 0 {
		return len(a) == len(b)
	}
	// 比较第一个元素的地址
	pa := &a[0]
	pb := &b[0]
	return pa == pb
}

// findTitle 在子树里找第一条看起来像 App 标题的字符串：
// 不是 URL / 不是纯 token / 不含 HTML / 长度在 2–120 之间
func findTitle(n any) string {
	var found string
	var walk func(x any)
	walk = func(x any) {
		if found != "" {
			return
		}
		switch v := x.(type) {
		case string:
			if looksLikeTitle(v) {
				found = v
			}
		case []any:
			for _, c := range v {
				walk(c)
			}
		}
	}
	walk(n)
	return found
}

// 已知非 title 的噪音字符串，用 set 过滤掉
var gpTitleNoise = map[string]struct{}{
	"Everyone": {}, "Teen": {}, "Mature 17+": {}, "Everyone 10+": {},
	"Users Interact": {}, "Learn more": {}, "Buy": {}, "Free": {},
}

func looksLikeTitle(s string) bool {
	// 长度下限放到 3 够覆盖 "BMW" "QQ" 等缩写（不过 BMW 全大写会被下面规则挡，
	// 权衡：漏掉极少数全大写的 app 名换掉 "USD/CAE/EUR" 这些大量噪音）
	if len(s) < 3 || len(s) > 120 {
		return false
	}
	if strings.HasPrefix(s, "http") || strings.HasPrefix(s, "/") {
		return false
	}
	if strings.Contains(s, "<") || strings.Contains(s, ">") {
		return false
	}
	if _, ok := gpTitleNoise[s]; ok {
		return false
	}
	// base64 token：通常以 = 结尾或包含 / + 等
	if strings.HasSuffix(s, "=") || strings.ContainsAny(s, "=") {
		return false
	}
	if isLikelyBase64Token(s) {
		return false
	}
	// 纯 ASCII 全大写（USD / CAE / BMW 这类）排除
	if isPureUpperASCII(s) {
		return false
	}
	// 排除 pkgName 格式（com.xxx.yyy）
	if gpPkgLikeRe.MatchString(s) {
		return false
	}
	return true
}

func isPureUpperASCII(s string) bool {
	hasLetter := false
	for _, r := range s {
		switch {
		case r >= 'A' && r <= 'Z':
			hasLetter = true
		case r >= '0' && r <= '9', r == ' ', r == '-', r == '_':
			// 允许
		default:
			return false
		}
	}
	return hasLetter
}

// isLikelyBase64Token 简易判断：仅 base64 字母、长度 > 20、含 = 或 / 或全大写驼峰的很可能是 token
func isLikelyBase64Token(s string) bool {
	if len(s) < 20 {
		return false
	}
	if strings.HasSuffix(s, "=") || strings.Contains(s, "==") {
		return true
	}
	alnum := 0
	slash := 0
	plus := 0
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			alnum++
		case r == '/':
			slash++
		case r == '+':
			plus++
		case r == '_' || r == '-':
			// url-safe base64
			alnum++
		default:
			return false
		}
	}
	// 全是 base64 字符且长度 >= 30，判定为 token
	return (alnum+slash+plus) == len(s) && len(s) >= 30 && (slash > 0 || plus > 0 || strings.ContainsAny(s, "_-"))
}

// findIcon 在子树里找第一个 play-lh 的 URL，并且过滤掉 support.google.com
func findIcon(n any) string {
	var found string
	var walk func(x any)
	walk = func(x any) {
		if found != "" {
			return
		}
		switch v := x.(type) {
		case string:
			if strings.Contains(v, gpIconHostFrag) && !strings.Contains(v, gpSupportHost) {
				found = v
			}
		case []any:
			for _, c := range v {
				walk(c)
			}
		}
	}
	walk(n)
	return found
}

// findInstalls 找 "10,000,000,000+" 或 "10B+" 风格的字符串
func findInstalls(n any) string {
	var found string
	var walk func(x any)
	walk = func(x any) {
		if found != "" {
			return
		}
		switch v := x.(type) {
		case string:
			if gpHumanCountRe.MatchString(v) {
				found = v
				return
			}
			if gpInstallsRe.MatchString(v) && strings.Contains(v, "+") {
				found = v
			}
		case []any:
			for _, c := range v {
				walk(c)
			}
		}
	}
	walk(n)
	return found
}

// afBlob 从 play.google.com SSR HTML 里提出来的一段 AF_initDataCallback 数据
type afBlob struct {
	Key  string
	Data string // 原始 JSON 字面量文本（未解析）
}

// extractAFBlobs 从 HTML 里提取所有 AF_initDataCallback({key:'ds:N',...,data:<JSON>,...}) 块
func extractAFBlobs(html string) []afBlob {
	var out []afBlob
	idx := 0
	for idx < len(html) {
		loc := gpAFBlobRe.FindStringSubmatchIndex(html[idx:])
		if loc == nil {
			break
		}
		absStart := idx + loc[0]
		key := html[idx+loc[2] : idx+loc[3]]
		dataStart := idx + loc[1]
		js := balanceBrackets(html, dataStart)
		if js != "" {
			out = append(out, afBlob{Key: key, Data: js})
			idx = dataStart + len(js)
		} else {
			idx = absStart + 1
		}
	}
	return out
}

// balanceBrackets 从 html[start] 开始，跳过空白，读入一个平衡的 [...] 或 {...} 字面量
func balanceBrackets(html string, start int) string {
	i := start
	for i < len(html) && (html[i] == ' ' || html[i] == '\t' || html[i] == '\n' || html[i] == '\r') {
		i++
	}
	if i >= len(html) {
		return ""
	}
	open := html[i]
	if open != '[' && open != '{' {
		return ""
	}
	startReal := i
	depth := 0
	inStr := false
	esc := false
	for ; i < len(html); i++ {
		ch := html[i]
		if esc {
			esc = false
			continue
		}
		if inStr {
			if ch == '\\' {
				esc = true
				continue
			}
			if ch == '"' {
				inStr = false
			}
			continue
		}
		switch ch {
		case '"':
			inStr = true
		case '[', '{':
			depth++
		case ']', '}':
			depth--
			if depth == 0 {
				return html[startReal : i+1]
			}
		}
	}
	return ""
}

// playLhURLFrequency 统计 JSON 原文里每个 play-lh URL 出现的次数。
// JSON 原文的 `/` 被转义成 `\/`，只在 unescape 后扫一遍即可。
func playLhURLFrequency(jsonText string) map[string]int {
	re := regexp.MustCompile(`https://play-lh\.googleusercontent\.com/[A-Za-z0-9_-]{16,}`)
	out := map[string]int{}
	unescaped := strings.ReplaceAll(jsonText, `\/`, "/")
	for _, m := range re.FindAllString(unescaped, -1) {
		out[m]++
	}
	return out
}

func urlQueryEscape(s string) string {
	// 避免引一个额外 import url；encodeURIComponent 等价
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '-', r == '_', r == '.', r == '~':
			b.WriteRune(r)
		default:
			buf := []byte(string(r))
			for _, x := range buf {
				b.WriteString(fmt.Sprintf("%%%02X", x))
			}
		}
	}
	return b.String()
}
