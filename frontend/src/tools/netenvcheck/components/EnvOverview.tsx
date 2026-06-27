import type { ReactNode } from 'react'
import { Layers } from 'lucide-react'
import type { netenvcheck } from '../../../../wailsjs/go/models'

// proxyLabel 把风险标记浓缩成一句「代理识别」结论。
function proxyLabel(risk: netenvcheck.RiskFlags): string {
  if (risk.isTor) return 'Tor 出口节点'
  if (risk.isProxy) return '识别为代理'
  if (risk.isVPN) return '识别为 VPN'
  return '未识别为代理'
}

function ipProtocol(ip: string): string {
  if (!ip) return '-'
  return ip.includes(':') ? 'IPv6' : 'IPv4'
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[13px]">{children || '-'}</span>
    </div>
  )
}

// EnvOverview 环境概览栏:把 12+ 项关键事实一屏呈现(对齐开源项目的环境栏)。
export function EnvOverview({ report }: { report: netenvcheck.Report }) {
  const g = report.backend.geo
  const c = report.consistency
  const webrtc = (report.webrtc.ips ?? []).join(', ')
  const dns = (report.dns.localServers ?? []).join(', ')

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs font-semibold text-muted-foreground">
        <Layers className="h-3.5 w-3.5" />
        环境概览
      </div>
      <div className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
        <div>
          <Field label="IP 地址">{report.backend.ip}</Field>
          <Field label="IP 协议">{ipProtocol(report.backend.ip)}</Field>
          <Field label="归属地">
            {[g.country, g.region, g.city].filter(Boolean).join(' / ')}
          </Field>
          <Field label="ASN">{[g.asn, g.org].filter(Boolean).join(' ')}</Field>
          <Field label="IP 类型">{g.ipType}</Field>
          <Field label="WebRTC IP">{webrtc}</Field>
        </div>
        <div>
          <Field label="代理识别">{proxyLabel(report.backend.risk)}</Field>
          <Field label="DNS">{dns}</Field>
          <Field label="系统时区">{c.systemOffset}</Field>
          <Field label="浏览器时区">{c.browserTimezone}</Field>
          <Field label="系统语言">{c.systemLanguage}</Field>
          <Field label="浏览器语言">
            {c.browserLanguage}
            {c.acceptLanguage ? `  (Accept-Language: ${c.acceptLanguage})` : ''}
          </Field>
        </div>
      </div>
    </div>
  )
}
