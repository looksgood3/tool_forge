// Package netenvcheck 提供"网络环境体检":检测当前出口 IP 的归属/风险、双路(原生 vs 浏览器)
// 出口一致性、WebRTC/DNS 泄漏、时区/语言一致性,并给出 0-100 评分与修复建议。
//
// 浏览器侧信号(WebView 出口 IP、WebRTC 候选、浏览器时区/语言/UA)后端拿不到,
// 必须由前端采集后通过 Input.Browser 传入;后端负责原生侧探测 + 统一评分。
package netenvcheck

// Preset 评分预设:严格 / 均衡 / 宽松,只影响扣分权重。
type Preset string

const (
	PresetBalanced Preset = "balanced"
	PresetStrict   Preset = "strict"
	PresetLenient  Preset = "lenient"
)

// BrowserProbe 前端 WebView 内采集的信号。
type BrowserProbe struct {
	EgressIP       string   `json:"egressIP"`       // WebView(走系统代理)看到的出口 IP
	EgressIPErr    string   `json:"egressIPErr"`    // 取 WebView 出口 IP 时的错误(若有)
	WebRTCIPs      []string `json:"webRTCIPs"`      // WebRTC srflx 候选里的公网 IP(前端已过滤私网/mDNS)
	WebRTCNote     string   `json:"webRTCNote"`     // WebRTC 探测说明(未启用/超时/被禁等)
	Timezone       string   `json:"timezone"`       // Intl 时区,如 Asia/Shanghai
	Language       string   `json:"language"`       // navigator.language,如 zh-CN
	Languages      []string `json:"languages"`      // navigator.languages
	AcceptLanguage string   `json:"acceptLanguage"` // 实际 HTTP Accept-Language(经 echo 服务回读)
	UserAgent      string   `json:"userAgent"`
	Platform       string   `json:"platform"` // navigator.platform
}

// Input 发起一次体检的入参。
type Input struct {
	Preset      Preset       `json:"preset"`
	ForceDirect bool         `json:"forceDirect"` // 后端探测强制直连(不走代理),用于暴露真实出口
	ProxyURL    string       `json:"proxyURL"`    // 可选:手动指定后端探测代理(http/https/socks5)
	IPinfoToken string       `json:"ipinfoToken"` // 选填高级源 token(前端从 keyring 取出后传入,不落前端存储)
	Sources     []string     `json:"sources"`     // 启用的数据源(ipwho.is/ifconfig.co/ipapi.is/ipinfo.io);空=全开。ipify 必跑
	Browser     BrowserProbe `json:"browser"`
}

// GeoInfo IP 归属(多源合并)。
type GeoInfo struct {
	Country     string  `json:"country"`     // 国家名
	CountryCode string  `json:"countryCode"` // ISO2
	Region      string  `json:"region"`
	City        string  `json:"city"`
	Timezone    string  `json:"timezone"` // IANA,来自 IP 归属
	ASN         string  `json:"asn"`      // AS 号,如 AS15169
	Org         string  `json:"org"`      // ISP/组织
	IPType      string  `json:"ipType"`   // IP 类型中文标签:住宅/家庭宽带、机房/托管、移动网络、商业宽带 等
	Latitude    float64 `json:"latitude,omitempty"`
	Longitude   float64 `json:"longitude,omitempty"`
}

// RiskFlags IP 风险标记(任一源命中即 true)。
type RiskFlags struct {
	IsDatacenter bool     `json:"isDatacenter"`
	IsProxy      bool     `json:"isProxy"`
	IsVPN        bool     `json:"isVPN"`
	IsTor        bool     `json:"isTor"`
	IsAbuser     bool     `json:"isAbuser"`
	IsMobile     bool     `json:"isMobile"` // 移动网络,中性偏好信号
	Hosting      string   `json:"hosting,omitempty"`
	Detail       []string `json:"detail,omitempty"`  // 命中说明(哪个源报的)
	Sources      []string `json:"sources,omitempty"` // 给出风险判定的源,用于置信度
}

// IPProbe 后端(原生)路探测到的出口 IP + 归属 + 风险。
type IPProbe struct {
	IP    string    `json:"ip"`
	Geo   GeoInfo   `json:"geo"`
	Risk  RiskFlags `json:"risk"`
	Via   string    `json:"via"` // 代理(env/TUN) / 强制直连 / 手动代理
	Error string    `json:"error,omitempty"`
}

// IPView 前端(WebView)路出口(回显前端给的)。
type IPView struct {
	IP    string `json:"ip"`
	Error string `json:"error,omitempty"`
}

// WebRTCView WebRTC 候选及泄漏判定。
type WebRTCView struct {
	IPs  []string `json:"ips"`
	Leak bool     `json:"leak"` // 存在 ≠ 出口 IP 的公网候选
	Note string   `json:"note,omitempty"`
}

// DualPath 后端路 vs WebView 路出口对比结论。
type DualPath struct {
	BackendIP  string `json:"backendIP"`
	WebViewIP  string `json:"webViewIP"`
	Match      bool   `json:"match"`
	Conclusion string `json:"conclusion"`
	Severity   string `json:"severity"` // ok / warn / bad
}

// DNSInfo 本机 DNS 解析器及泄漏判定。
type DNSInfo struct {
	LocalServers []string `json:"localServers"`
	Leak         bool     `json:"leak"`
	Note         string   `json:"note,omitempty"`
	Error        string   `json:"error,omitempty"`
}

// Consistency 时区/语言/UA 一致性。
type Consistency struct {
	SystemOffset    string `json:"systemOffset"` // 系统 UTC 偏移,如 +08:00
	BrowserTimezone string `json:"browserTimezone"`
	IPTimezone      string `json:"ipTimezone"`
	TimezoneMatch   bool   `json:"timezoneMatch"`

	SystemLanguage  string `json:"systemLanguage"` // 系统区域语言(仅展示,不计分)
	BrowserLanguage string `json:"browserLanguage"`
	AcceptLanguage  string `json:"acceptLanguage"` // 实际 HTTP Accept-Language(仅展示)
	IPCountry       string `json:"ipCountry"`
	LanguageMatch   bool   `json:"languageMatch"`

	UserAgent    string `json:"userAgent"`
	UAConsistent bool   `json:"uaConsistent"`

	Notes []string `json:"notes,omitempty"`
}

// ScoreItem 一条命中的扣分项。
type ScoreItem struct {
	Key        string `json:"key"`
	Title      string `json:"title"`
	Points     int    `json:"points"` // 扣的分(正数)
	Detail     string `json:"detail"`
	Confidence string `json:"confidence"` // 高/中/低
}

// Remediation 一条修复建议。
type Remediation struct {
	Key         string   `json:"key"`
	Title       string   `json:"title"`
	Impact      int      `json:"impact"`   // 修复后预估可提升分
	Severity    string   `json:"severity"` // high/medium/low
	Steps       []string `json:"steps"`
	Command     string   `json:"command,omitempty"`     // 可复制命令
	SettingsURI string   `json:"settingsURI,omitempty"` // Windows ms-settings: 链接
}

// SourceStat 单个数据源的执行状态。
type SourceStat struct {
	Source string `json:"source"`
	OK     bool   `json:"ok"`
	Error  string `json:"error,omitempty"`
	MS     int    `json:"ms"`
}

// Report 一次完整体检结果。
type Report struct {
	GeneratedAt int64         `json:"generatedAt"` // unix ms
	Preset      Preset        `json:"preset"`
	Score       int           `json:"score"` // 0-100
	Grade       string        `json:"grade"` // 优秀/良好/一般/高风险
	Backend     IPProbe       `json:"backend"`
	WebView     IPView        `json:"webview"`
	WebRTC      WebRTCView    `json:"webrtc"`
	DualPath    DualPath      `json:"dualPath"`
	DNS         DNSInfo       `json:"dns"`
	Consistency Consistency   `json:"consistency"`
	Deductions  []ScoreItem   `json:"deductions"`
	Remediation []Remediation `json:"remediation"`
	Sources     []SourceStat  `json:"sources"`
}
