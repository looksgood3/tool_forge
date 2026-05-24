package outlookmail

import (
	"html"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// 关键词列表(中英文)— 移植自 outlookEmailPlus 的 VERIFICATION_KEYWORDS
var verificationKeywords = []string{
	"验证码",
	"code",
	"验证",
	"verification",
	"OTP",
	"动态码",
	"校验码",
	"verify code",
	"confirmation code",
	"security code",
	"验证码是",
	"your code",
	"code is",
	"激活码",
	"短信验证码",
}

// 4-8 位字母数字组合,必须含至少一个数字
var verificationPattern = regexp.MustCompile(`\b[A-Z0-9]{4,8}\b`)
var verificationPatternCI = regexp.MustCompile(`(?i)\b[A-Z0-9]{4,8}\b`)

// 链接(http/https)
var linkPattern = regexp.MustCompile(`https?://[^\s<>"{}|\\^` + "`" + `\[\]]+`)

// 链接相关短语(完整短语,避免 "confirm your order" 等误命中)
var linkContextPhrases = []string{
	"verify your email",
	"verify your account",
	"verify your address",
	"confirm your email",
	"confirm your account",
	"confirm your address",
	"activate your email",
	"activate your account",
	"email verification",
	"account verification",
	"验证您的邮箱",
	"验证你的邮箱",
	"验证您的账户",
	"验证你的账户",
	"验证您的账号",
	"验证你的账号",
	"确认您的邮箱",
	"确认你的邮箱",
	"确认您的账户",
	"确认你的账户",
	"激活您的账户",
	"激活你的账户",
	"激活您的邮箱",
	"激活你的邮箱",
	"邮箱验证",
	"账号验证",
	"账户验证",
}

// 链接 URL 中的关键词(verify/confirm/activate 等)
var linkKeywords = []string{
	"verify",
	"confirmation",
	"confirm",
	"activate",
	"validation",
}

// SmartExtractCode 智能验证码提取:
//  1. 找关键词位置
//  2. 在关键词前后 ±50 字符里找符合 [A-Z0-9]{4,8} 且含数字的串
//  3. 命中即返回(大写)
//
// 没命中 → 退回 fallback
func SmartExtractCode(text string) string {
	if text == "" {
		return ""
	}
	textLower := strings.ToLower(text)
	for _, kw := range verificationKeywords {
		kwLower := strings.ToLower(kw)
		pos := strings.Index(textLower, kwLower)
		if pos < 0 {
			continue
		}
		start := pos - 50
		if start < 0 {
			start = 0
		}
		end := pos + len(kw) + 50
		if end > len(text) {
			end = len(text)
		}
		ctx := text[start:end]
		matches := verificationPatternCI.FindAllString(ctx, -1)
		for _, m := range matches {
			if hasDigit(m) {
				return strings.ToUpper(m)
			}
		}
	}
	return ""
}

// FallbackExtractCode 保底:全文找 [A-Z0-9]{4,8} 含数字 + 排除年份/时间。
func FallbackExtractCode(text string) string {
	if text == "" {
		return ""
	}
	matches := verificationPatternCI.FindAllString(text, -1)
	for _, m := range matches {
		mu := strings.ToUpper(m)
		if !hasDigit(m) {
			continue
		}
		// 排除年份
		if len(m) == 4 && allDigits(m) {
			n, _ := strconv.Atoi(m)
			if n >= 1900 && n <= 2100 {
				continue
			}
			// 时间 HHMM
			hour, _ := strconv.Atoi(m[:2])
			minute, _ := strconv.Atoi(m[2:])
			if hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 {
				continue
			}
		}
		return mu
	}
	return ""
}

// ExtractCode 顶层 API:先智能再保底
func ExtractCode(text string) string {
	if c := SmartExtractCode(text); c != "" {
		return c
	}
	return FallbackExtractCode(text)
}

// ExtractLinks 抽出所有 http/https 链接,去重 + 按"验证相关度"排序(高的在前):
//
//   - 含 verify/confirm/activate 关键词的链接优先
//   - 出现在"验证您的邮箱"等短语附近 ±100 字符的链接次之
func ExtractLinks(text string) []string {
	if text == "" {
		return nil
	}
	raw := linkPattern.FindAllString(text, -1)
	if len(raw) == 0 {
		return nil
	}
	// 清理末尾标点
	cleaned := make([]string, 0, len(raw))
	seen := make(map[string]bool)
	for _, l := range raw {
		l = strings.TrimRight(l, ".,;:!?)>'\"")
		if seen[l] {
			continue
		}
		seen[l] = true
		cleaned = append(cleaned, l)
	}
	// 计算每条链接的相关度
	textLower := strings.ToLower(text)
	type scoredLink struct {
		url   string
		score int
		idx   int // 原始顺序,用于稳定排序
	}
	scored := make([]scoredLink, 0, len(cleaned))
	for i, l := range cleaned {
		s := 0
		lLower := strings.ToLower(l)
		for _, kw := range linkKeywords {
			if strings.Contains(lLower, kw) {
				s += 10
			}
		}
		// 链接附近 ±100 字符是否有验证语境短语
		pos := strings.Index(text, l)
		if pos >= 0 {
			start := pos - 100
			if start < 0 {
				start = 0
			}
			end := pos + len(l) + 100
			if end > len(text) {
				end = len(text)
			}
			ctxLower := textLower[start:end]
			for _, ph := range linkContextPhrases {
				if strings.Contains(ctxLower, ph) {
					s += 5
					break
				}
			}
		}
		scored = append(scored, scoredLink{url: l, score: s, idx: i})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		return scored[i].idx < scored[j].idx
	})
	out := make([]string, 0, len(scored))
	for _, s := range scored {
		out = append(out, s.url)
	}
	return out
}

// ExtractFromMail 综合:对一封邮件做验证码 + 链接提取。
// htmlBody 会先转纯文本再处理,plain 优先。
func ExtractFromMail(plain, htmlBody string) ExtractResult {
	text := pickText(plain, htmlBody)
	res := ExtractResult{}
	if c := SmartExtractCode(text); c != "" {
		res.Code = c
		res.Source = "keyword"
	} else if c := FallbackExtractCode(text); c != "" {
		res.Code = c
		res.Source = "pattern"
	}
	res.Links = ExtractLinks(text)
	if res.Code == "" && len(res.Links) > 0 {
		res.Source = "link"
	}
	return res
}

func pickText(plain, htmlBody string) string {
	if s := strings.TrimSpace(plain); s != "" {
		return s
	}
	if htmlBody != "" {
		return htmlToText(htmlBody)
	}
	return ""
}

// htmlToText 极简的 HTML 转纯文本:剥 script/style 段,再去 tag,解 entity。
func htmlToText(s string) string {
	if s == "" {
		return ""
	}
	// 去掉 script / style 段
	for _, tag := range []string{"script", "style", "head", "title"} {
		re := regexp.MustCompile(`(?is)<` + tag + `\b[^>]*>.*?</` + tag + `>`)
		s = re.ReplaceAllString(s, " ")
	}
	// <br> / </p> / </div> 换行
	s = regexp.MustCompile(`(?i)<br\s*/?>`).ReplaceAllString(s, "\n")
	s = regexp.MustCompile(`(?i)</(p|div|tr|li|h[1-6])>`).ReplaceAllString(s, "\n")
	// 剩余 tag 全清
	s = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(s, " ")
	// 解 entity
	s = html.UnescapeString(s)
	// 折叠空白
	s = regexp.MustCompile(`[ \t]+`).ReplaceAllString(s, " ")
	s = regexp.MustCompile(`\n[ \t]*`).ReplaceAllString(s, "\n")
	s = regexp.MustCompile(`\n{3,}`).ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}

func hasDigit(s string) bool {
	for _, c := range s {
		if c >= '0' && c <= '9' {
			return true
		}
	}
	return false
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// 让 verificationPattern 不被未使用警告
var _ = verificationPattern
