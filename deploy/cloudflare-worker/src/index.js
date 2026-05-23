/**
 * Tool Forge Update Manifest · Cloudflare Worker
 *
 * 读 GitHub Release "latest",转成 Tool Forge 客户端 (backend/updater) 期望的
 * Manifest JSON。客户端代码不需要任何改动,只把 ManifestURL 指过来即可。
 *
 * 路由:
 *   GET /                  返回 manifest(默认 Windows asset)
 *   GET /manifest.json     同上
 *   GET /health            健康检查
 *
 * 边缘缓存 5 分钟,新版发布后客户端最多延迟 5 分钟感知。
 *
 * sha256 来源(按优先级):
 *   1) asset.digest 字段(GitHub 2024+ 默认会返回 "sha256:hex...")
 *   2) Release body 里的 "SHA256: <hex>" 行
 *
 * is_critical:Release body 里出现 "[critical]" 标记则为 true,客户端会强制提醒。
 */

const GH_OWNER = 'xiaoxu123195'
const GH_REPO = 'tool_forge'
const SLUG = 'tool-forge'

// Windows asset 文件名匹配模式(从前往后试,命中即用)
const WIN_ASSET_PATTERNS = [
  /amd64.*installer\.exe$/i,
  /installer.*\.exe$/i,
  /windows.*\.exe$/i,
  /\.exe$/i,
]

const CACHE_TTL_SECONDS = 300

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return json({ ok: true, time: new Date().toISOString() })
    }

    if (url.pathname !== '/' && !url.pathname.endsWith('manifest.json')) {
      return new Response('Not Found', { status: 404 })
    }

    try {
      const manifest = await buildManifest(env)
      return json(manifest, {
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      })
    } catch (e) {
      if (e.status === 404) {
        // 客户端 checker.go 把 404 当作"已是最新",不弹错
        return json({ error: 'no release' }, {}, 404)
      }
      return json({ error: e.message || String(e) }, {}, 502)
    }
  },
}

async function buildManifest(env) {
  const headers = {
    'user-agent': 'tool-forge-update-worker',
    accept: 'application/vnd.github+json',
  }
  if (env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${env.GITHUB_TOKEN}`
  }

  const resp = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`,
    { headers, cf: { cacheTtl: 60, cacheEverything: true } },
  )

  if (resp.status === 404) {
    const err = new Error('no published release')
    err.status = 404
    throw err
  }
  if (!resp.ok) {
    throw new Error(`GitHub API ${resp.status}`)
  }

  const release = await resp.json()
  const asset = pickWindowsAsset(release.assets || [])
  if (!asset) {
    throw new Error('no Windows asset in latest release (checked .exe patterns)')
  }

  const body = release.body || ''
  const sha256 = extractSha256(asset, body)
  if (!sha256) {
    throw new Error(
      'sha256 not found: asset.digest missing AND no "SHA256: <hex>" in release body',
    )
  }

  return {
    slug: SLUG,
    version: stripV(release.tag_name || ''),
    channel: release.prerelease ? 'beta' : 'stable',
    released_at: release.published_at || release.created_at || '',
    download_url: asset.browser_download_url,
    sha256: sha256.toLowerCase(),
    size_bytes: asset.size,
    changelog: cleanChangelog(body),
    is_critical: /\[critical\]/i.test(body),
  }
}

function pickWindowsAsset(assets) {
  for (const pattern of WIN_ASSET_PATTERNS) {
    const hit = assets.find((a) => pattern.test(a.name))
    if (hit) return hit
  }
  return null
}

function extractSha256(asset, body) {
  if (typeof asset.digest === 'string' && asset.digest.startsWith('sha256:')) {
    return asset.digest.slice(7)
  }
  const m = body.match(/SHA256[:\s]+([a-fA-F0-9]{64})/)
  return m ? m[1] : ''
}

function cleanChangelog(body) {
  return body
    .split('\n')
    .filter((line) => !/^\s*SHA256[:\s]/i.test(line))
    .filter((line) => !/^\s*\[critical\]\s*$/i.test(line))
    .join('\n')
    .trim()
}

function stripV(tag) {
  return tag.replace(/^v/i, '')
}

function json(data, extraHeaders = {}, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      ...extraHeaders,
    },
  })
}
