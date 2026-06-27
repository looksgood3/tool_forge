// Package llmproxy 提供一个本地 LLM API 透明转发 + 日志复盘工具:
// 把客户端的 base_url 指到本代理(路径路由 /{upstream}/...),记录每次请求/响应
// (含 SSE 流),存到 SQLite,提供列表/详情/重放。
//
// 安全:落盘前对 Authorization / api-key 等敏感头脱敏(只存打码 + 尾部指纹,绝不存原始 key),
// 转发给上游时仍用客户端原始头。设计参考开源项目 PrismCat,但密钥处理更严、与工具箱深度集成。
package llmproxy

// Upstream 一个上游目标。路由名作为 URL 第一段:/{name}/v1/...
type Upstream struct {
	Name          string `json:"name"`          // 路由名,如 openai;只允许字母数字-_
	Target        string `json:"target"`        // 上游基址,如 https://api.openai.com
	TimeoutSec    int    `json:"timeoutSec"`    // 等待上游首字节超时(秒),0=120;不限制流式总时长
	OutboundProxy string `json:"outboundProxy"` // 出站代理:""/direct 直连、env 跟随环境变量、http(s)://、socks5://
	Disabled      bool   `json:"disabled"`      // 禁用后该上游不再转发(老配置缺此字段=false=启用,迁移安全)
}

// Config 持久化配置(~/.toolforge/llm-proxy.json)。
type Config struct {
	Enabled       bool       `json:"enabled"`
	Port          int        `json:"port"`
	Upstreams     []Upstream `json:"upstreams"`
	RetentionDays int        `json:"retentionDays"` // 日志保留天数,0=永久
	MaxBodyKB     int        `json:"maxBodyKB"`     // 单条 body 落库上限(KB),超出截断并标记
}

// DefaultConfig 全新安装默认:不启用,端口 8788,预置一个 openai 上游,保留 30 天。
func DefaultConfig() Config {
	return Config{
		Enabled:       false,
		Port:          8788,
		Upstreams:     []Upstream{{Name: "openai", Target: "https://api.openai.com", TimeoutSec: 120, OutboundProxy: "env"}},
		RetentionDays: 30,
		MaxBodyKB:     8192,
	}
}

// Status 实时状态。
type Status struct {
	Running      bool   `json:"running"`
	Addr         string `json:"addr"`
	Error        string `json:"error,omitempty"`        // 监听错误(端口占用等)
	LastLogError string `json:"lastLogError,omitempty"` // 最近一次写日志失败原因(如多实例锁库)
}

// LogEntry 列表项(不含 body/headers)。
type LogEntry struct {
	ID               int64  `json:"id"`
	TS               int64  `json:"ts"` // unix ms
	Upstream         string `json:"upstream"`
	Method           string `json:"method"`
	Path             string `json:"path"`
	Status           int    `json:"status"`
	DurationMs       int    `json:"durationMs"`
	Stream           bool   `json:"stream"`
	ReqBytes         int    `json:"reqBytes"`
	RespBytes        int    `json:"respBytes"`
	Model            string `json:"model"`
	PromptTokens     int    `json:"promptTokens"`
	CompletionTokens int    `json:"completionTokens"`
	TotalTokens      int    `json:"totalTokens"`
	Tag              string `json:"tag"`
	Error            string `json:"error,omitempty"`
}

// LogDetail 详情(含头与体)。
type LogDetail struct {
	Entry         LogEntry          `json:"entry"`
	ReqHeaders    map[string]string `json:"reqHeaders"`
	RespHeaders   map[string]string `json:"respHeaders"`
	ReqBody       string            `json:"reqBody"`
	RespBody      string            `json:"respBody"` // 非流:原始响应;流:合并后的文本
	RespRaw       string            `json:"respRaw"`  // 流:原始 SSE chunks;非流:空
	ReqTruncated  bool              `json:"reqTruncated"`
	RespTruncated bool              `json:"respTruncated"`
}

// LogQuery 列表过滤。
type LogQuery struct {
	Upstream string `json:"upstream"`
	Method   string `json:"method"`
	Status   string `json:"status"` // ""/2xx/4xx/5xx/error
	Search   string `json:"search"` // 路径/model 模糊匹配
	Limit    int    `json:"limit"`
	Offset   int    `json:"offset"`
}

// LogPage 分页结果。
type LogPage struct {
	Items []LogEntry `json:"items"`
	Total int        `json:"total"`
}

// ReplayInput 重放一条请求(密钥未落盘,需用户在 headers 里自带 Authorization)。
type ReplayInput struct {
	Upstream string            `json:"upstream"`
	Method   string            `json:"method"`
	Path     string            `json:"path"`
	Headers  map[string]string `json:"headers"`
	Body     string            `json:"body"`
}

// capture 一次转发期间累积的记录,转发结束后写入 store。
type capture struct {
	ts           int64
	upstream     string
	method       string
	path         string
	reqHeaders   map[string]string
	reqBody      string
	reqBytes     int
	reqTrunc     bool
	status       int
	respEncoding string // 上游 Content-Encoding(gzip/deflate),捕获侧据此解压
	respHeaders  map[string]string
	respBody     string // 原始响应(非流)或原始 SSE(流)
	respMerged   string // 流合并后的文本(非流为空)
	respBytes    int
	respTrunc    bool
	stream       bool
	durationMs   int
	model        string
	tag          string
	promptTok    int
	completeTok  int
	totalTok     int
	errMsg       string
}
