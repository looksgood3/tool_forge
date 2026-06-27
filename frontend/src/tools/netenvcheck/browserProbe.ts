import type { netenvcheck } from '../../../wailsjs/go/models'

// collectBrowserProbe 在 WebView 内采集后端拿不到的信号:
// WebView 出口 IP(走系统代理)、WebRTC srflx 候选、浏览器时区/语言/UA。
export async function collectBrowserProbe(): Promise<netenvcheck.BrowserProbe> {
  const [egress, webrtc, acceptLanguage] = await Promise.all([
    fetchWebViewIP(),
    collectWebRTC(),
    fetchAcceptLanguage(),
  ])
  let timezone = ''
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    timezone = ''
  }
  return {
    egressIP: egress.ip,
    egressIPErr: egress.err,
    webRTCIPs: webrtc.ips,
    webRTCNote: webrtc.note,
    timezone,
    language: navigator.language || '',
    languages: Array.from(navigator.languages || []),
    acceptLanguage,
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
  }
}

// fetchAcceptLanguage 通过 httpbin 回读 WebView 实际发出的 Accept-Language 头。
async function fetchAcceptLanguage(): Promise<string> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const resp = await fetch('https://httpbin.org/headers', {
      signal: ctrl.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    const data = (await resp.json()) as { headers?: Record<string, string> }
    return data.headers?.['Accept-Language'] || ''
  } catch {
    return ''
  }
}

// fetchWebViewIP 从 WebView 直接请求 ipify(走系统代理),拿到浏览器侧出口 IP。
async function fetchWebViewIP(): Promise<{ ip: string; err: string }> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const resp = await fetch('https://api.ipify.org/?format=json', {
      signal: ctrl.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    const data = (await resp.json()) as { ip?: string }
    return { ip: data.ip || '', err: data.ip ? '' : '空响应' }
  } catch (e) {
    return { ip: '', err: e instanceof Error ? e.message : '请求失败' }
  }
}

// collectWebRTC 通过 STUN 收集 ICE 候选里的 IP(含 srflx 公网反射地址)。
// 后端再过滤出公网 IP 并与出口比对判定泄漏。
async function collectWebRTC(timeoutMs = 3000): Promise<{ ips: string[]; note: string }> {
  return new Promise((resolve) => {
    const ips = new Set<string>()
    let pc: RTCPeerConnection
    try {
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
        ],
      })
    } catch {
      resolve({ ips: [], note: '当前环境不支持 WebRTC' })
      return
    }

    let settled = false
    const finish = (note: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      resolve({ ips: Array.from(ips), note })
    }
    const timer = setTimeout(
      () => finish(ips.size ? '' : 'WebRTC 未返回候选(UDP 可能被代理/防火墙拦截)'),
      timeoutMs
    )

    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        finish(ips.size ? '' : '未发现公网候选')
        return
      }
      const cand = e.candidate.candidate
      if (cand.includes('.local')) return // mDNS 隐藏的本地候选,跳过
      const v4 = cand.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)
      if (v4) ips.add(v4[0])
      const v6 = cand.match(/\b(?:[a-f0-9]{1,4}:){2,}[a-f0-9:]+\b/i)
      if (v6) ips.add(v6[0])
    }

    try {
      pc.createDataChannel('probe')
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => finish('WebRTC 协商失败'))
    } catch {
      finish('WebRTC 协商失败')
    }
  })
}
