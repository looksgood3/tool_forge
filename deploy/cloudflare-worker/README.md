# Tool Forge Update Manifest Worker

Cloudflare Worker，把 GitHub Release "latest" 转成 Tool Forge 客户端
（`backend/updater`）期望的 Manifest JSON。

## 这个 Worker 做了什么

```
客户端 (Tool Forge.exe)
   │  GET https://tool-forge-update.<account>.workers.dev/manifest.json
   ▼
Cloudflare Worker  ←─── GitHub Release Latest API
   │  转换字段
   ▼
{
  "slug": "tool-forge",
  "version": "0.2.0",
  "channel": "stable",
  "released_at": "2026-05-23T...",
  "download_url": "https://github.com/.../releases/download/v0.2.0/ToolForge.exe",
  "sha256": "...",
  "size_bytes": 21000000,
  "changelog": "...",
  "is_critical": false
}
```

发版后客户端最多 5 分钟感知（Worker 边缘缓存 TTL）。

## 部署步骤（首次约 10 分钟）

### 1. 注册 / 登录 Cloudflare

- https://dash.cloudflare.com/sign-up （免费）

### 2. 安装 Wrangler CLI

```bash
cd deploy/cloudflare-worker
npm install
```

### 3. 登录 Cloudflare

```bash
npx wrangler login
```

会自动打开浏览器要求授权。

### 4. 部署

```bash
npx wrangler deploy
```

输出里会有类似：

```
Published tool-forge-update
  https://tool-forge-update.<你的子域>.workers.dev
```

把这个 URL 记下来，下一步要用。

### 5. 验证

浏览器打开：

```
https://tool-forge-update.<你的子域>.workers.dev/manifest.json
```

应该看到 JSON，包含 `version` / `download_url` / `sha256` 等字段。

如果返回 `{"error":"no release"}` —— 说明 GitHub 还没发过 Release。

如果返回 `{"error":"sha256 not found..."}` —— 看下方 [SHA256 来源](#sha256-来源) 章节。

### 6. 把客户端 ManifestURL 指过来

修改 `backend/updater/types.go`：

```go
const ManifestURL = "https://tool-forge-update.<你的子域>.workers.dev/manifest.json"
```

重新 `wails build` 即可。

### 7.（可选）配置 GitHub Token

不配也能用，但 Cloudflare Worker 共用 GitHub 公共 API 限流（每小时 60 次/IP）。
加一个 token 可以拉到 5000/h：

```bash
# GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
# 创建一个 token, repo 范围只勾 "Contents - Read", 复制 token

npx wrangler secret put GITHUB_TOKEN
# 粘贴 token 回车
```

Worker 会自动检测并使用。

### 8.（可选）绑定自定义域名

如果你有自己的域名（已在 Cloudflare 托管 DNS），编辑 `wrangler.toml`：

```toml
routes = [
  { pattern = "update.example.com/*", custom_domain = true }
]
```

再 `npx wrangler deploy`。

---

## SHA256 来源

Worker 按这个顺序找 sha256：

1. **GitHub Release Asset 的 `digest` 字段**（2024 年后 GH API 默认返回 `sha256:<hex>`）
2. **Release Body 里的 `SHA256: <hex>` 行**（fallback）

如果你 `wails build` 完手动算 sha256 上传 Release，可以在 release notes 末尾加：

```
SHA256: 91c4e3d8a7...（64 位 hex）
```

或者用 `gh release create` 一条龙：

```bash
SHA=$(sha256sum build/bin/ToolForge.exe | cut -d' ' -f1)
gh release create v0.2.0 build/bin/ToolForge.exe \
  --title "v0.2.0" \
  --notes "## 更新内容
- ...

SHA256: $SHA"
```

---

## 标记关键更新（强制提醒）

在 Release Body 里加一行：

```
[critical]
```

Worker 会把 manifest 里 `is_critical` 设为 `true`，客户端可以据此做强制升级 UI。

---

## 监控 / 排错

- **Dashboard**：https://dash.cloudflare.com → Workers & Pages → tool-forge-update
- **日志**：`npx wrangler tail` 实时查看请求日志
- **本地测试**：`npx wrangler dev` 启动本地 dev server

---

## 成本

Cloudflare Workers 免费档：**每天 100,000 次请求**。Tool Forge 用户端每天检查一次更新，
理论上能支撑 100k DAU 完全免费。GitHub API 配合 token 上限 5000/h，但 Worker 边缘缓存 5 分钟，
所以即使 100k DAU 也只会回源 ~12 次/小时。

零月费，可以一直用。
