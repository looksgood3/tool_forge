import { useState } from 'react'
import { Check, Copy, ExternalLink, Wrench } from 'lucide-react'
import type { netenvcheck } from '../../../../wailsjs/go/models'
import { BrowserOpenURL } from '../../../../wailsjs/runtime/runtime'
import { cn } from '@/lib/utils'
import { remedySeverityClass } from '../ui'

export function DeductionList({ items }: { items: netenvcheck.ScoreItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
        没有命中任何扣分项,当前网络环境很干净。
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {items.map((d) => (
        <div
          key={d.key}
          className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2"
        >
          <span className="mt-0.5 shrink-0 rounded bg-red-500/15 px-2 py-0.5 font-mono text-xs font-bold text-red-600 dark:text-red-400">
            -{d.points}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{d.title}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                置信度 {d.confidence}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground break-all">{d.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function RemediationPanel({ items }: { items: netenvcheck.Remediation[] }) {
  if (!items || items.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wrench className="h-4 w-4" />
        修复建议
      </div>
      {items.map((m) => (
        <RemediationItem key={m.key} item={m} />
      ))}
    </div>
  )
}

function RemediationItem({ item }: { item: netenvcheck.Remediation }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!item.command) return
    try {
      await navigator.clipboard.writeText(item.command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', remedySeverityClass(item.severity))}>
            {item.severity}
          </span>
          <span className="text-sm font-medium">{item.title}</span>
        </div>
        <span className="shrink-0 font-mono text-xs text-emerald-600 dark:text-emerald-400">
          预估 +{item.impact}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
        {(item.steps ?? []).map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="select-none text-muted-foreground/60">·</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
      {(item.command || item.settingsURI) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.command && (
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 font-mono text-[11px] hover:bg-accent"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span className="max-w-[260px] truncate">{item.command}</span>
            </button>
          )}
          {item.settingsURI && (
            <button
              onClick={() => BrowserOpenURL(item.settingsURI!)}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-accent"
            >
              <ExternalLink className="h-3 w-3" />
              打开系统设置
            </button>
          )}
        </div>
      )}
    </div>
  )
}
