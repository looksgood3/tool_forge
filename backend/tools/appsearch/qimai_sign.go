package appsearch

import (
	"encoding/base64"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Go 原生实现 七麦 api.qimai.cn 的 analysis 签名（等价于 reverse_js/search/七麦/七麦.js）。
//
// 算法：
//  1. 取 params 除 analysis 外的所有值，转字符串、字典序排序、拼接
//  2. base64(utf8(拼接结果)) → a
//  3. a += "@#" + path + "@#" + ts + "@#3"，ts = now_ms - 513 - 1661224081041
//  4. 按 key="xyz517cda96efgh"、偏移 (i+10)%len(key) 字节 XOR
//  5. 再 base64 一次

const (
	qimaiAnalysisKey     = "xyz517cda96efgh"
	qimaiTimestampOffset = int64(513 + 1661224081041)
)

// qimaiAnalysis 为 GET 请求生成 analysis 参数。
// path 应为以 '/' 开头的 API 路径（相对 https://api.qimai.cn），
// 如 "/search/index" 或 "/andapp/detail"。
func qimaiAnalysis(path string, params map[string]string) string {
	values := make([]string, 0, len(params))
	for k, v := range params {
		if k == "analysis" {
			continue
		}
		values = append(values, v)
	}
	sort.Strings(values)
	joined := strings.Join(values, "")

	a := base64.StdEncoding.EncodeToString([]byte(joined))
	ts := time.Now().UnixMilli() - qimaiTimestampOffset
	a = a + "@#" + path + "@#" + strconv.FormatInt(ts, 10) + "@#3"

	xored := qimaiXor(a, qimaiAnalysisKey)
	return base64.StdEncoding.EncodeToString([]byte(xored))
}

func qimaiXor(s, key string) string {
	b := make([]byte, len(s))
	kl := len(key)
	for i := 0; i < len(s); i++ {
		b[i] = s[i] ^ key[(i+10)%kl]
	}
	return string(b)
}
