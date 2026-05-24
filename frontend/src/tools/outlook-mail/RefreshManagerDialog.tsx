import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, Loader2, Play, X, XCircle } from 'lucide-react'
import { EventsOff, EventsOn } from '../../../wailsjs/runtime/runtime'
import { cn } from '@/lib/utils'
import { outlookAPI } from './api'
import type { RefreshJobState } from './types'

const EV_START = 'outlook:refresh:start'
const EV_PROGRESS = 'outlook:refresh:progress'
const EV_DONE = 'outlook:refresh:done'

export function RefreshManagerDialog({
  totalAccounts,
  onClose,
  onAfterRefresh,
}: {
  totalAccounts: number
  onClose: () => void
  onAfterRefresh: () => void
}) {
  const [active, setActive] = useState<RefreshJobState[]>([])
  const [history, setHistory] = useState<RefreshJobState[]>([])
  const [query, setQuery] = useState('')

  const reload = async () => {
    const [a, h] = await Promise.all([
      outlookAPI.listActiveRefreshJobs(),
      outlookAPI.listRefreshHistory(),
    ])
    setActive(a)
    setHistory(h)
  }

  useEffect(() => {
    void reload()
    EventsOn(EV_START, () => void reload())
    EventsOn(EV_PROGRESS, (s: RefreshJobState) => {
      setActive((prev) => {
        const idx = prev.findIndex((x) => x.job_id === s.job_id)
        if (idx < 0) return [...prev, s]
        const next = [...prev]
        next[idx] = s
        return next
      })
    })
    EventsOn(EV_DONE, () => {
      void reload()
      onAfterRefresh()
    })
    return () => {
      EventsOff(EV_START)
      EventsOff(EV_PROGRESS)
      EventsOff(EV_DONE)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRefreshAll = async () => {
    await outlookAPI.startRefreshJob([])
  }

  const cancel = async (jobID: string) => {
    await outlookAPI.cancelRefreshJob(jobID)
  }

  const all = useMemo(() => {
    const merged = [...active, ...history]
    if (!query.trim()) return merged
    const q = query.toLowerCase()
    return merged.filter((j) =>
      j.results.some((r) => r.email.toLowerCase().includes(q) || (r.reason ?? '').toLowerCase().includes(q)),
    )
  }, [active, history, query])

  // 统计:总账号 / 进行中 / 已完成
  const inProgress = active.reduce((s, j) => s + (j.total - j.done), 0)
  const finishedJobs = history.length

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-[820px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="text-amber-500">🔑</span>
            Token 刷新管理
          </h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {/* 统计卡片 */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="账号总数" value={totalAccounts} />
            <StatCard label="进行中" value={inProgress} highlight={inProgress > 0} />
            <StatCard label="历史任务" value={finishedJobs} />
          </div>

          {/* 操作栏 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startRefreshAll}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" />
              立即全量刷新
            </button>
            <input
              type="text"
              placeholder="搜索邮箱 / 失败原因"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="ml-auto h-8 w-56 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
            />
          </div>

          {/* 进行中任务 */}
          {active.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold">进行中</h4>
              <div className="space-y-2">
                {active.map((j) => (
                  <ActiveJob key={j.job_id} job={j} onCancel={() => cancel(j.job_id)} />
                ))}
              </div>
            </section>
          )}

          {/* 历史 */}
          <section>
            <h4 className="mb-1.5 text-xs font-semibold">历史</h4>
            {history.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                还没有任务历史
              </div>
            ) : (
              <div className="space-y-2">
                {(query.trim() ? all.filter((j) => !active.some((a) => a.job_id === j.job_id)) : history).map((j) => (
                  <FinishedJob key={j.job_id} job={j} query={query} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-2xl font-semibold', highlight && 'text-info')}>{value}</div>
    </div>
  )
}

function ActiveJob({ job, onCancel }: { job: RefreshJobState; onCancel: () => void }) {
  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0
  return (
    <div className="rounded-md border border-info/40 bg-info/5 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 font-medium">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-info" />
          进度 {job.done}/{job.total}({pct}%)
          <span className="text-muted-foreground">· 成功 {job.success} · 失败 {job.failed}</span>
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 text-[11px] text-destructive hover:bg-destructive/20"
        >
          <XCircle className="h-3 w-3" />
          取消
        </button>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/50">
        <div className="h-full bg-info transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function FinishedJob({ job, query }: { job: RefreshJobState; query: string }) {
  const [open, setOpen] = useState(false)
  const failed = job.results.filter((r) => !r.success)
  const filteredResults = useMemo(() => {
    if (!query.trim()) return job.results
    const q = query.toLowerCase()
    return job.results.filter(
      (r) => r.email.toLowerCase().includes(q) || (r.reason ?? '').toLowerCase().includes(q),
    )
  }, [job.results, query])
  const startStr = new Date(job.start_at).toLocaleString()

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-accent/40"
      >
        <span className="inline-flex items-center gap-2">
          {job.canceled ? (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          ) : failed.length === 0 ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          )}
          <span className="font-medium">{startStr}</span>
          <span className="text-muted-foreground">
            · 总 {job.total} · 成功 {job.success} · 失败 {job.failed}
            {job.canceled && ' · 已取消'}
          </span>
        </span>
        <span className="text-muted-foreground">{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="border-t border-border bg-muted/20 p-2">
          <table className="w-full text-[11px]">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1 pr-2 text-left font-medium">邮箱</th>
                <th className="py-1 pr-2 text-left font-medium">结果</th>
                <th className="py-1 pr-2 text-left font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((r, i) => (
                <tr key={i} className="border-b border-border/40 last:border-b-0">
                  <td className="py-1 pr-2 font-mono">{r.email}</td>
                  <td className="py-1 pr-2">
                    {r.success ? (
                      <span className="text-success">✓ 成功</span>
                    ) : (
                      <span className="text-destructive">✕ 失败</span>
                    )}
                  </td>
                  <td className="py-1 pr-2 break-all text-muted-foreground">{r.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
