// Package updater 负责 Tool Forge 的更新检查、下载、自搬家。
package updater

// ManifestURL 指向托管 Tool Forge manifest 的服务。
//
// 当前方案:Cloudflare Worker(代码见 deploy/cloudflare-worker/),
// 它读 GitHub Release "latest" 并转成本结构体期望的 JSON。
// 发新版只需在 GitHub 发 Release,Worker 自动暴露给客户端,无需任何服务器维护。
//
// 部署完成后把下方 URL 改成 wrangler deploy 输出的实际地址,
// 形如 https://tool-forge-update.<你的 CF 账号子域>.workers.dev/manifest.json
// 部署步骤见 deploy/cloudflare-worker/README.md
const ManifestURL = "https://tool-forge-update.xiaoxu123195.workers.dev/manifest.json"

// DownloadPrefix 下载到 Downloads 时用的文件名前缀；自搬家判断也看这个
const DownloadPrefix = "ToolForge-v"

// Manifest 与 Hub 侧 public.ManifestBody 对齐
//
// 时间字段统一用 RFC3339 字符串传递，跨 API 边界不走 time.Time——
// 既避开 wails TS 绑定生成器对 time.Time 的不识别，又让 Go/TS 两侧类型身份一致。
type Manifest struct {
	Slug        string `json:"slug"`
	Version     string `json:"version"`
	Channel     string `json:"channel"`
	ReleasedAt  string `json:"released_at"`
	DownloadURL string `json:"download_url"`
	SHA256      string `json:"sha256"`
	SizeBytes   int64  `json:"size_bytes"`
	Changelog   string `json:"changelog"`
	IsCritical  bool   `json:"is_critical"`
}

// CheckResult 返回给前端用于 UI 渲染
type CheckResult struct {
	CurrentVersion string    `json:"current_version"`
	LatestVersion  string    `json:"latest_version"`
	HasUpdate      bool      `json:"has_update"`
	Manifest       *Manifest `json:"manifest,omitempty"`
	CheckedAt      string    `json:"checked_at"`
}

// DownloadResult 下载完成后的结果
type DownloadResult struct {
	LocalPath string `json:"local_path"`
	Version   string `json:"version"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
}

// DownloadProgress 通过 Wails 事件 "update:download-progress" 推送
type DownloadProgress struct {
	Loaded  int64 `json:"loaded"`
	Total   int64 `json:"total"`
	Percent int   `json:"percent"`
}
