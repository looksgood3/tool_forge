package netenvcheck

import "testing"

// 干净住宅 IP + 全部一致 → 满分。
func TestComputeScore_Clean(t *testing.T) {
	rep := &Report{
		Preset:      PresetBalanced,
		DualPath:    DualPath{Match: true, Severity: "ok"},
		Consistency: Consistency{TimezoneMatch: true, LanguageMatch: true, UAConsistent: true},
	}
	computeScore(rep)
	if rep.Score != 100 {
		t.Fatalf("干净环境应 100 分,实际 %d", rep.Score)
	}
	if rep.Grade != "优秀" {
		t.Fatalf("应评优秀,实际 %s", rep.Grade)
	}
	if len(rep.Deductions) != 0 {
		t.Fatalf("不应有扣分项,实际 %d", len(rep.Deductions))
	}
}

// 机房+代理 IP → 25+20=45 扣分,得 55 分「一般」。
func TestComputeScore_DatacenterProxy(t *testing.T) {
	rep := &Report{
		Preset:      PresetBalanced,
		Backend:     IPProbe{Risk: RiskFlags{IsDatacenter: true, IsProxy: true, Sources: []string{"ipapi.is"}}},
		DualPath:    DualPath{Match: true, Severity: "ok"},
		Consistency: Consistency{TimezoneMatch: true, LanguageMatch: true, UAConsistent: true},
	}
	computeScore(rep)
	if rep.Score != 55 {
		t.Fatalf("机房+代理应 55 分,实际 %d", rep.Score)
	}
	if rep.Grade != "一般" {
		t.Fatalf("应评一般,实际 %s", rep.Grade)
	}
	if len(rep.Remediation) != 2 {
		t.Fatalf("应有两条修复建议,实际 %d", len(rep.Remediation))
	}
}

// 严格档放大惩罚:datacenter 25→35。
func TestComputeScore_StrictScaling(t *testing.T) {
	rep := &Report{
		Preset:      PresetStrict,
		Backend:     IPProbe{Risk: RiskFlags{IsDatacenter: true, Sources: []string{"ipapi.is"}}},
		DualPath:    DualPath{Match: true, Severity: "ok"},
		Consistency: Consistency{TimezoneMatch: true, LanguageMatch: true, UAConsistent: true},
	}
	computeScore(rep)
	if rep.Score != 65 {
		t.Fatalf("严格档机房应扣 35 → 65 分,实际 %d", rep.Score)
	}
}

// 双路不一致(分流)+ WebRTC 泄漏 触发对应扣分。
func TestComputeScore_LeakSignals(t *testing.T) {
	rep := &Report{
		Preset:      PresetBalanced,
		DualPath:    DualPath{Match: false, Severity: "bad", Conclusion: "分流"},
		WebRTC:      WebRTCView{Leak: true, IPs: []string{"1.2.3.4"}},
		Consistency: Consistency{TimezoneMatch: true, LanguageMatch: true, UAConsistent: true},
	}
	computeScore(rep)
	// 15(分流) + 15(WebRTC) = 30 → 70
	if rep.Score != 70 {
		t.Fatalf("分流+WebRTC 泄漏应 70 分,实际 %d", rep.Score)
	}
	keys := map[string]bool{}
	for _, d := range rep.Deductions {
		keys[d.Key] = true
	}
	if !keys["dualpath_mismatch"] || !keys["webrtc_leak"] {
		t.Fatalf("应同时命中 dualpath_mismatch 与 webrtc_leak,实际 %+v", keys)
	}
}

// 分数下限为 0,不会出现负分。
func TestComputeScore_Floor(t *testing.T) {
	rep := &Report{
		Preset: PresetStrict,
		Backend: IPProbe{Risk: RiskFlags{
			IsDatacenter: true, IsProxy: true, IsVPN: true, IsTor: true, IsAbuser: true,
			Sources: []string{"ipapi.is"},
		}},
		DualPath:    DualPath{Match: false, Severity: "bad"},
		WebRTC:      WebRTCView{Leak: true},
		Consistency: Consistency{TimezoneMatch: false, LanguageMatch: false, UAConsistent: false},
	}
	computeScore(rep)
	if rep.Score != 0 {
		t.Fatalf("满命中应被钳到 0 分,实际 %d", rep.Score)
	}
	if rep.Grade != "高风险" {
		t.Fatalf("应评高风险,实际 %s", rep.Grade)
	}
}

func TestLangRegion(t *testing.T) {
	cases := map[string]string{
		"zh-CN": "CN", "en-US": "US", "zh-Hans-CN": "CN", "en": "", "zh-Hant": "",
	}
	for in, want := range cases {
		if got := langRegion(in); got != want {
			t.Errorf("langRegion(%q)=%q,want %q", in, got, want)
		}
	}
}
