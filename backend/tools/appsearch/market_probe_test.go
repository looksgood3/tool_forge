package appsearch

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"testing"
	"time"
)

// 用 QIMAI_KEYWORD 环境变量指定关键词，默认 "微信"
func probeKeyword() string {
	if k := os.Getenv("QIMAI_KEYWORD"); k != "" {
		return k
	}
	return "微信"
}

// 把 Market=3 (应用宝) 的原始响应 dump 出来，看嵌套结构
func TestDumpRaw_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	sid := os.Getenv("QIMAI_PHPSESSID")
	if sid == "" {
		t.Skip("set QIMAI_PHPSESSID to enable")
	}
	kw := probeKeyword()
	markets := []int{6, 8, 9, 3} // 华为 / VIVO / OPPO / 应用宝
	client := &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{Proxy: nil}}
	for _, m := range markets {
		params := map[string]string{
			"search":  kw,
			"country": "cn",
			"market":  strconv.Itoa(m),
			"page":    "1",
		}
		path := "/search/android"
		params["analysis"] = qimaiAnalysis(path, params)
		q := url.Values{}
		for k, v := range params {
			q.Set(k, v)
		}
		req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, qimaiBase+path+"?"+q.Encode(), nil)
		applyQimaiHeaders(req, sid)
		resp, err := client.Do(req)
		if err != nil {
			t.Logf("market=%d ERR %v", m, err)
			continue
		}
		buf := make([]byte, 4096)
		n, _ := resp.Body.Read(buf)
		resp.Body.Close()
		t.Logf("\n===== market=%d keyword=%q =====\n%s", m, kw, string(buf[:n]))
	}
}

// 一次性扫描全部 market，打印原始 code/msg/total/apps/logout，排查哪些能通哪些不能
func TestAllMarkets_Online(t *testing.T) {
	if !onlineEnabled() {
		t.Skip("set APPSEARCH_ONLINE=1 to enable")
	}
	sid := os.Getenv("QIMAI_PHPSESSID")
	if sid == "" {
		t.Skip("set QIMAI_PHPSESSID to enable")
	}

	markets := []struct {
		id   int
		name string
	}{
		{1, "360"}, {2, "百度"}, {3, "应用宝"}, {4, "小米"}, {5, "豌豆荚"},
		{6, "华为"}, {7, "魅族"}, {8, "VIVO"}, {9, "OPPO"}, {10, "Google Play"}, {11, "鸿蒙"},
	}

	client := &http.Client{
		Timeout:   15 * time.Second,
		Transport: &http.Transport{Proxy: nil},
	}

	kw := probeKeyword()
	for _, m := range markets {
		params := map[string]string{
			"search":  kw,
			"country": "cn",
			"market":  strconv.Itoa(m.id),
			"page":    "1",
		}
		path := "/search/android"
		params["analysis"] = qimaiAnalysis(path, params)

		q := url.Values{}
		for k, v := range params {
			q.Set(k, v)
		}
		req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, qimaiBase+path+"?"+q.Encode(), nil)
		applyQimaiHeaders(req, sid)

		resp, err := client.Do(req)
		if err != nil {
			t.Logf("[%2d %s] ERR %v", m.id, m.name, err)
			continue
		}
		var parsed struct {
			Code     int             `json:"code"`
			Msg      string          `json:"msg"`
			TotalNum int             `json:"totalNum"`
			AppList  json.RawMessage `json:"appList"`
			IsLogout int             `json:"is_logout"`
			Extra    map[string]any  `json:"-"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&parsed)
		resp.Body.Close()

		// re-read raw
		nApps := 0
		if parsed.AppList != nil {
			var arr []any
			_ = json.Unmarshal(parsed.AppList, &arr)
			nApps = len(arr)
		}
		t.Logf("[%2d %-12s] code=%d msg=%q total=%d apps=%d logout=%d",
			m.id, m.name, parsed.Code, parsed.Msg, parsed.TotalNum, nApps, parsed.IsLogout)
	}
}
