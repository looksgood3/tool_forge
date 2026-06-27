import type { ReactNode } from 'react'
import {
  Check,
  Globe,
  Network,
  ServerCog,
  ShieldAlert,
  Webhook,
  X,
} from 'lucide-react'
import type { netenvcheck } from '../../../../wailsjs/go/models'
import { cn } from '@/lib/utils'
import { goodBadClass, severityBoxClass } from '../ui'

function Card({
  title,
  icon,
  children,
  className,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-[13px] break-all">{children}</span>
    </div>
  )
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        on
          ? 'bg-red-500/15 text-red-600 dark:text-red-400'
          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      )}
    >
      {on ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
      {label}
    </span>
  )
}

export function IpOverviewCard({ report }: { report: netenvcheck.Report }) {
  const g = report.backend.geo
  return (
    <Card title="出口 IP 与归属" icon={<Globe className="h-3.5 w-3.5" />}>
      <Row label={`原生 · ${report.backend.via}`}>{report.backend.ip || report.backend.error || '-'}</Row>
      <Row label="浏览器 WebView">{report.webview.ip || report.webview.error || '-'}</Row>
      <div className="my-2 border-t border-border/50" />
      <Row label="国家 / 地区">
        {[g.country, g.region, g.city].filter(Boolean).join(' / ') || '-'}
      </Row>
      <Row label="ASN / 组织">{[g.asn, g.org].filter(Boolean).join(' ') || '-'}</Row>
      <Row label="IP 时区">{g.timezone || '-'}</Row>
    </Card>
  )
}

export function DualPathCard({ dual }: { dual: netenvcheck.DualPath }) {
  return (
    <Card title="双路出口对比" icon={<Network className="h-3.5 w-3.5" />}>
      <div className={cn('rounded-md border p-2.5 text-[13px] leading-relaxed', severityBoxClass(dual.severity))}>
        {dual.conclusion}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md bg-secondary/40 p-2">
          <div className="text-[11px] text-muted-foreground">原生出口</div>
          <div className="font-mono text-xs break-all">{dual.backendIP || '-'}</div>
        </div>
        <div className="rounded-md bg-secondary/40 p-2">
          <div className="text-[11px] text-muted-foreground">浏览器出口</div>
          <div className="font-mono text-xs break-all">{dual.webViewIP || '-'}</div>
        </div>
      </div>
    </Card>
  )
}

export function RiskCard({ risk }: { risk: netenvcheck.RiskFlags }) {
  return (
    <Card title="IP 风险标记" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
      <div className="flex flex-wrap gap-1.5">
        <Flag label="机房" on={risk.isDatacenter} />
        <Flag label="代理" on={risk.isProxy} />
        <Flag label="VPN" on={risk.isVPN} />
        <Flag label="Tor" on={risk.isTor} />
        <Flag label="滥用" on={risk.isAbuser} />
        {risk.isMobile && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-600 dark:text-sky-400">
            移动网络
          </span>
        )}
      </div>
      {risk.hosting && (
        <div className="mt-2 text-xs text-muted-foreground">托管商:{risk.hosting}</div>
      )}
      {risk.detail && risk.detail.length > 0 && (
        <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          {risk.detail.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
      )}
      {(!risk.sources || risk.sources.length === 0) && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          未获取到风险数据源(ipapi.is 未返回?)
        </div>
      )}
    </Card>
  )
}

export function WebRTCCard({ webrtc }: { webrtc: netenvcheck.WebRTCView }) {
  return (
    <Card title="WebRTC 泄漏" icon={<Webhook className="h-3.5 w-3.5" />}>
      <div className="mb-2">
        {webrtc.leak ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
            <X className="h-3 w-3" /> 检测到泄漏
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" /> 未发现泄漏
          </span>
        )}
      </div>
      {webrtc.ips && webrtc.ips.length > 0 ? (
        <div className="space-y-0.5 font-mono text-xs">
          {webrtc.ips.map((ip) => (
            <div key={ip}>{ip}</div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">{webrtc.note || '无公网候选'}</div>
      )}
    </Card>
  )
}

export function DnsCard({ dns }: { dns: netenvcheck.DNSInfo }) {
  return (
    <Card title="DNS 解析器" icon={<ServerCog className="h-3.5 w-3.5" />}>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {(dns.localServers ?? []).length > 0 ? (
          dns.localServers.map((s) => (
            <span key={s} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">
              {s}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">未读取到 DNS 配置</span>
        )}
      </div>
      {(dns.note || dns.error) && (
        <div className={cn('text-[11px] leading-relaxed', dns.leak ? goodBadClass(false) : 'text-muted-foreground')}>
          {dns.error || dns.note}
        </div>
      )}
    </Card>
  )
}

export function ConsistencyCard({ c }: { c: netenvcheck.Consistency }) {
  return (
    <Card title="时区 / 语言 / UA 一致性" icon={<Check className="h-3.5 w-3.5" />}>
      <CheckRow ok={c.timezoneMatch} label="时区">
        浏览器 {c.browserTimezone || '-'} · 系统 {c.systemOffset} · IP {c.ipTimezone || '-'}
      </CheckRow>
      <CheckRow ok={c.languageMatch} label="语言">
        {c.browserLanguage || '-'} vs IP 国家 {c.ipCountry || '-'}
      </CheckRow>
      <CheckRow ok={c.uaConsistent} label="UA">
        {c.uaConsistent ? '与平台一致' : '与运行平台矛盾'}
      </CheckRow>
    </Card>
  )
}

function CheckRow({ ok, label, children }: { ok: boolean; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1 text-[13px]">
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'
        )}
      >
        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <div className="min-w-0">
        <span className="mr-1.5 font-medium">{label}</span>
        <span className="text-xs text-muted-foreground break-all">{children}</span>
      </div>
    </div>
  )
}

export function SourcesBar({ sources }: { sources: netenvcheck.SourceStat[] }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span>数据源:</span>
      {sources.map((s) => (
        <span
          key={s.source}
          title={s.error || ''}
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
            s.ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
          )}
        >
          {s.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {s.source} {s.ms}ms
        </span>
      ))}
    </div>
  )
}
