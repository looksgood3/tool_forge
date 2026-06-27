package appsearch

import "testing"

// 复现并防回归:Google Play 结果 blob 含对象(map)节点时,旧版 sameNode 用 ==
// 比较 map 会触发 "comparing uncomparable type map[string]interface {}" panic,
// 在裸 goroutine 里直接崩掉整个 app(只勾 Google Play 搜 WhatsApp 等)。
func TestSameNode_MapNoPanic(t *testing.T) {
	m1 := map[string]any{"a": float64(1)}
	m2 := map[string]any{"a": float64(1)}
	if !sameNode(m1, m1) {
		t.Error("同一 map 实例应判定为同一节点")
	}
	if sameNode(m1, m2) {
		t.Error("不同 map 实例不应判定为同一节点")
	}
	// 不同类型 / 空切片都不应 panic
	_ = sameNode(m1, []any{})
	_ = sameNode([]any{}, []any{})
	_ = sameNode("x", "x")
}

// 端到端:含 map 祖先的 JSON 树过一遍 collectGPSearchCards,旧代码会 panic,
// 修复后应正常抽出包名。
func TestCollectGPSearchCards_WithMapNodes_NoPanic(t *testing.T) {
	root := []any{
		map[string]any{
			"a": []any{
				[]any{"/store/apps/details?id=com.whatsapp"},
				[]any{"WhatsApp Messenger"},
			},
			"b": []any{
				[]any{"/store/apps/details?id=org.telegram.messenger"},
				[]any{"Telegram"},
			},
		},
	}
	cards := collectGPSearchCards(root, map[string]int{})
	got := map[string]bool{}
	for _, c := range cards {
		got[c.PkgName] = true
	}
	if !got["com.whatsapp"] || !got["org.telegram.messenger"] {
		t.Errorf("应抽出两个包名,实际: %+v", cards)
	}
}

// 复现并防回归:Google 改版后结果里没有 preferred 图标([0,0])、只有 normal 图标时,
// iconMap 曾因 uniqueAssign 返回 nil,在 fallback 写入时 panic "assignment to entry in nil map"。
// 这才是最近"只勾 Google Play 搜索崩溃/失败"的真正触发点。
func TestCollectGPSearchCards_NilIconMap_NoPanic(t *testing.T) {
	iconURL := "https://play-lh.googleusercontent.com/ABCDEFGHIJKLMNOP1"
	card := []any{
		[]any{"/store/apps/details?id=com.whatsapp"},
		[]any{"WhatsApp Messenger"},
		// 图像元组 [null, 2, [512,512], [null,null,url]] —— 产生 normal 图标(非 [0,0])
		[]any{nil, float64(2), []any{float64(512), float64(512)}, []any{nil, nil, iconURL}},
	}
	root := []any{card}
	cards := collectGPSearchCards(root, map[string]int{iconURL: 1})
	found := false
	for _, c := range cards {
		if c.PkgName == "com.whatsapp" {
			found = true
		}
	}
	if !found {
		t.Errorf("应抽到 com.whatsapp,实际: %+v", cards)
	}
}
