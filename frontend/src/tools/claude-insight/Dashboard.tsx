import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  Clock,
  Coins,
  Database,
  Folder,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CostCard } from '@/components/tool/CostCard'
import {
  usePricingStore,
  priceForModel,
  claudeCost,
  formatUSD,
  type ClaudeModelTokens,
} from '@/lib/pricing'
import { BuildClaudeDashboard } from '../../../wailsjs/go/main/App'
import type { claudeinsight } from '../../../wailsjs/go/models'
import {
  formatDate,
  formatDuration,
  formatLocalDate,
  formatRelative,
  formatTokens,
  shortenProject,
  weekdayLabel,
} from './lib/format'

type Report = claudeinsight.DashboardReport

interface DashboardProps {
  reloadToken: number
}

export function Dashboard({ reloadToken }: DashboardProps) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    BuildClaudeDashboard('')
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  if (loading && !report) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!report) return null
  if (report.total_sessions === 0) return <EmptyClaudeDir dir={report.claude_dir} />

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PrivacyBanner dir={report.claude_dir} />
      <OverviewCards report={report} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Last7DaysChart buckets={report.last_7_days} />
        <ByProjectChart projects={report.by_project} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CalendarHeatmap buckets={report.calendar} />
        </div>
        <CacheModelCard models={report.tokens_by_model} />
      </div>
      <TokensByModelTable rows={report.tokens_by_model} />
      <CostCard kind="claude" models={report.tokens_by_model} />
      <LongestSessionBanner s={report.longest_session} />
      <RecentSessionsList list={report.recent_sessions} />
    </div>
  )
}

function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      正在扫描 ~/.claude/projects ...
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="h-8 w-8 text-red-500" />
      <div className="max-w-md text-sm text-muted-foreground">{message}</div>
    </div>
  )
}

function EmptyClaudeDir({ dir }: { dir: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Sparkles className="h-10 w-10 text-info" />
      <div className="space-y-1">
        <h2 className="text-base font-medium">未找到任何 Claude Code 会话</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          在 <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">{dir}</code>{' '}
          下没有读到 JSONL 会话文件。
          如果你还没有用过 Claude Code 就会是这个状态。
        </p>
      </div>
    </div>
  )
}

function PrivacyBanner({ dir }: { dir: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span>所有数据仅在本地读取,不上传任何服务器。</span>
      <span className="ml-auto truncate font-mono text-[11px]" title={dir}>
        {dir}
      </span>
    </div>
  )
}

function OverviewCards({ report }: { report: Report }) {
  const totalTokens = useMemo(
    () =>
      report.tokens_by_model.reduce(
        (sum, m) =>
          sum +
          m.input_tokens +
          m.output_tokens +
          m.cache_creation_tokens +
          m.cache_read_tokens,
        0
      ),
    [report.tokens_by_model]
  )

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard icon={<MessageSquare className="h-4 w-4" />} label="总会话" value={report.total_sessions.toLocaleString()} />
      <StatCard icon={<Zap className="h-4 w-4" />} label="总消息" value={report.total_messages.toLocaleString()} />
      <StatCard icon={<Calendar className="h-4 w-4" />} label="活跃天数" value={report.active_days.toLocaleString()} />
      <StatCard icon={<Coins className="h-4 w-4" />} label="总 Token" value={formatTokens(totalTokens)} />
      <StatCard
        icon={<Clock className="h-4 w-4" />}
        label="首次使用"
        value={formatDate(report.first_used_at)}
        wide
      />
      <StatCard
        icon={<Clock className="h-4 w-4" />}
        label="最近使用"
        value={formatRelative(report.last_used_at)}
        wide
      />
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  wide,
}: {
  icon: React.ReactNode
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        'group rounded-lg border border-border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-foreground/5',
        wide && 'md:col-span-2'
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-info/20 to-info/10 text-info transition-transform duration-200 group-hover:scale-110">
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

// niceAxisMax 给柱状图算一个"漂亮"的轴上限:略高于数据峰值并取整。
// 例如峰值 6000 -> 6500、200 -> 250、37 -> 40,让最高的柱子也留一点顶部空白。
function niceAxisMax(dataMax: number): number {
  if (dataMax <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(dataMax)))
  const step = Math.max(1, mag / 2)
  return (Math.floor(dataMax / step) + 1) * step
}

function Last7DaysChart({ buckets }: { buckets: claudeinsight.DailyBucket[] }) {
  const dataMax = Math.max(0, ...buckets.map((b) => b.messages))
  const axisMax = niceAxisMax(dataMax)
  const total = buckets.reduce((s, b) => s + b.messages, 0)
  const peak = buckets.reduce((p, b) => (b.messages > p.messages ? b : p), buckets[0])
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">近 7 天消息数</h3>
        <span className="text-[11px] text-muted-foreground">
          共 {total.toLocaleString()} 条 · 日均{' '}
          {Math.round(total / 7).toLocaleString()}
          {peak && peak.messages > 0 && (
            <> · 峰值 {peak.messages} 条（{weekdayLabel(peak.date)}）</>
          )}
        </span>
      </div>
      {/* items-stretch(默认)让每列撑满容器高度,柱子的百分比高度才有参照,否则会塌成一条线 */}
      <div className="flex h-44 items-stretch gap-3">
        {buckets.map((b) => {
          const h = (b.messages / axisMax) * 100
          const isPeak = peak && b.messages > 0 && b.messages === peak.messages
          return (
            <div
              key={b.date}
              className="group flex flex-1 flex-col items-center"
              title={`${b.date} · ${b.messages} 条`}
            >
              <div className="mb-1 h-4 text-[11px] font-mono tabular-nums text-foreground/80">
                {b.messages > 0 ? b.messages : ''}
              </div>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn(
                    'w-full rounded-t transition-colors',
                    b.messages === 0
                      ? 'bg-secondary'
                      : isPeak
                      ? 'bg-info/80 group-hover:bg-info'
                      : 'bg-info/40 group-hover:bg-info/70'
                  )}
                  style={{ height: `${h}%`, minHeight: b.messages > 0 ? 4 : 2 }}
                />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {weekdayLabel(b.date)}
              </div>
              <div className="text-[10px] text-muted-foreground/70">
                {b.date.slice(5)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PROJECT_BAR_PALETTE = [
  'bg-info/70',
  'bg-emerald-500/60',
  'bg-amber-500/60',
  'bg-violet-500/60',
  'bg-rose-500/60',
  'bg-cyan-500/60',
  'bg-lime-500/60',
  'bg-orange-500/60',
]

function ByProjectChart({ projects }: { projects: claudeinsight.ProjectStats[] }) {
  const prices = usePricingStore((s) => s.prices)
  const [metric, setMetric] = useState<'cost' | 'tokens'>('cost')

  const rows = useMemo(() => {
    return (projects ?? [])
      .map((p) => {
        let tokens = 0
        let cost = 0
        for (const m of p.by_model) {
          tokens += m.input_tokens + m.output_tokens + m.cache_creation_tokens + m.cache_read_tokens
          cost += claudeCost(m as unknown as ClaudeModelTokens, prices) ?? 0
        }
        return { project: p.project, sessions: p.sessions, messages: p.messages, tokens, cost }
      })
      .sort((a, b) => (metric === 'cost' ? b.cost - a.cost : b.tokens - a.tokens))
  }, [projects, prices, metric])

  const top = rows.slice(0, 8)
  const rest = rows.length - top.length
  const max = Math.max(1, ...top.map((r) => (metric === 'cost' ? r.cost : r.tokens)))

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Folder className="h-4 w-4 text-info" />
          按项目排行
        </h3>
        <MetricToggle metric={metric} onChange={setMetric} />
      </div>
      {top.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">暂无项目数据</div>
      ) : (
        <div className="space-y-2">
          {top.map((r, i) => {
            const val = metric === 'cost' ? r.cost : r.tokens
            const w = (val / max) * 100
            return (
              <div key={r.project} className="group" title={r.project}>
                <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">
                    {shortenProject(r.project)}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {metric === 'cost' ? formatUSD(r.cost) : formatTokens(r.tokens)}
                  </span>
                  <span className="w-14 shrink-0 text-right text-[10px] text-muted-foreground">
                    {r.sessions} 会话
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn('h-full rounded-full transition-all', PROJECT_BAR_PALETTE[i % PROJECT_BAR_PALETTE.length])}
                    style={{ width: `${Math.max(w, val > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            )
          })}
          {rest > 0 && (
            <div className="pt-1 text-[10px] text-muted-foreground/70">另有 {rest} 个项目未显示</div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricToggle({
  metric,
  onChange,
}: {
  metric: 'cost' | 'tokens'
  onChange: (m: 'cost' | 'tokens') => void
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border text-[11px]">
      {(['cost', 'tokens'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            'px-2 py-0.5 transition-colors',
            metric === m ? 'bg-info/15 text-info' : 'text-muted-foreground hover:bg-secondary'
          )}
        >
          {m === 'cost' ? '花费' : 'Token'}
        </button>
      ))}
    </div>
  )
}

const MODEL_SHARE_PALETTE = [
  'bg-info/70',
  'bg-emerald-500/60',
  'bg-amber-500/60',
  'bg-violet-500/60',
  'bg-rose-500/60',
  'bg-cyan-500/60',
]

function CacheModelCard({ models }: { models: claudeinsight.ModelTokens[] }) {
  const prices = usePricingStore((s) => s.prices)

  const { hitRate, savings, shares, hasData } = useMemo(() => {
    let input = 0
    let cacheWrite = 0
    let cacheRead = 0
    let sav = 0
    const perModel = (models ?? []).map((m) => {
      input += m.input_tokens
      cacheWrite += m.cache_creation_tokens
      cacheRead += m.cache_read_tokens
      const p = priceForModel(m.model, prices)
      if (p) sav += (m.cache_read_tokens * Math.max(0, p.input - p.cacheRead)) / 1_000_000
      const tot = m.input_tokens + m.output_tokens + m.cache_creation_tokens + m.cache_read_tokens
      return { model: m.model, tot }
    })
    const grand = perModel.reduce((s, x) => s + x.tot, 0)
    const denom = input + cacheWrite + cacheRead
    const shares = perModel
      .filter((x) => x.tot > 0)
      .sort((a, b) => b.tot - a.tot)
      .map((x) => ({ ...x, pct: grand > 0 ? (x.tot / grand) * 100 : 0 }))
    return {
      hitRate: denom > 0 ? (cacheRead / denom) * 100 : 0,
      savings: sav,
      shares,
      hasData: grand > 0,
    }
  }, [models, prices])

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        <Database className="h-4 w-4 text-info" />
        缓存与模型
      </h3>
      {!hasData ? (
        <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
          暂无用量数据
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-muted-foreground">缓存命中率</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums">{hitRate.toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">缓存约省下</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatUSD(savings)}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] text-muted-foreground">模型占比（按 Token）</div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              {shares.map((s, i) => (
                <div
                  key={s.model}
                  className={cn('h-full', MODEL_SHARE_PALETTE[i % MODEL_SHARE_PALETTE.length])}
                  style={{ width: `${s.pct}%` }}
                  title={`${s.model} · ${s.pct.toFixed(0)}%`}
                />
              ))}
            </div>
            <div className="mt-2 space-y-1">
              {shares.slice(0, 4).map((s, i) => (
                <div key={s.model} className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-sm', MODEL_SHARE_PALETTE[i % MODEL_SHARE_PALETTE.length])}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={s.model}>
                    {shortModelName(s.model)}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">{s.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// shortModelName 把 claude-opus-4-8-... 这种长 id 压短一点,图例里好看
function shortModelName(model: string): string {
  if (!model) return '(未知)'
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

// 行0=周日;只在周一/周三/周五给标签,跟 GitHub 贡献图一致
const WEEKDAY_LETTERS = ['', '一', '', '三', '', '五', '']

function CalendarHeatmap({ buckets }: { buckets: claudeinsight.DailyBucket[] }) {
  const weeks = 26
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = formatLocalDate(today)

  const map = new Map<string, number>()
  for (const b of buckets) map.set(b.date, b.messages)

  // 网格按周对齐:行0=周日,最后一列=本周。从"本周日"往前推 weeks-1 周作为左上角。
  const thisSunday = new Date(today)
  thisSunday.setDate(today.getDate() - today.getDay())
  const gridStart = new Date(thisSunday)
  gridStart.setDate(thisSunday.getDate() - (weeks - 1) * 7)

  type Cell = { date: string; messages: number; future: boolean }
  const columns: { days: Cell[]; monthLabel: string }[] = []
  let prevMonth = -1
  let activeDays = 0
  let totalMsg = 0
  const nonzero: number[] = []
  for (let w = 0; w < weeks; w++) {
    const days: Cell[] = []
    let monthLabel = ''
    for (let r = 0; r < 7; r++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + w * 7 + r)
      const key = formatLocalDate(d)
      const future = key > todayKey
      const messages = future ? 0 : map.get(key) ?? 0
      if (!future && messages > 0) {
        activeDays++
        totalMsg += messages
        nonzero.push(messages)
      }
      days.push({ date: key, messages, future })
      if (r === 0) {
        const m = d.getMonth()
        if (m !== prevMonth) {
          monthLabel = `${m + 1}月`
          prevMonth = m
        }
      }
    }
    columns.push({ days, monthLabel })
  }

  // 用 85 分位作为色阶上限,避免某一天爆量把其它天全压成最浅色
  nonzero.sort((a, b) => a - b)
  const scaleMax = nonzero.length ? Math.max(1, nonzero[Math.floor((nonzero.length - 1) * 0.85)]) : 1

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">活跃日历</h3>
        <span className="text-[11px] text-muted-foreground">
          最近 {weeks} 周 · {activeDays} 天活跃 · 共 {totalMsg.toLocaleString()} 条
        </span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          {/* 月份标签行 */}
          <div className="flex gap-[3px]">
            <div className="w-4 shrink-0" />
            {columns.map((col, ci) => (
              <div key={ci} className="relative h-3 w-3 shrink-0">
                {col.monthLabel && (
                  <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] leading-3 text-muted-foreground">
                    {col.monthLabel}
                  </span>
                )}
              </div>
            ))}
          </div>
          {/* 主体:左侧周几 + 各周列 */}
          <div className="flex gap-[3px]">
            <div className="flex w-4 shrink-0 flex-col gap-[3px]">
              {WEEKDAY_LETTERS.map((lbl, i) => (
                <div key={i} className="flex h-3 items-center text-[9px] leading-none text-muted-foreground">
                  {lbl}
                </div>
              ))}
            </div>
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.days.map((c, ri) =>
                  c.future ? (
                    <div key={ri} className="h-3 w-3" />
                  ) : (
                    <div
                      key={ri}
                      title={`${c.date} · ${c.messages} 条`}
                      className={cn(
                        'h-3 w-3 rounded-[3px] ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.05]',
                        heatLevelClass(
                          c.messages === 0 ? 0 : Math.min(4, Math.ceil((c.messages / scaleMax) * 4))
                        )
                      )}
                    />
                  )
                )}
              </div>
            ))}
          </div>
          {/* 图例 */}
          <div className="flex items-center gap-1 self-end pt-1 text-[9px] text-muted-foreground">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span
                key={l}
                className={cn(
                  'h-3 w-3 rounded-[3px] ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.05]',
                  heatLevelClass(l)
                )}
              />
            ))}
            <span>多</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function heatLevelClass(level: number): string {
  switch (level) {
    case 0:
      return 'bg-secondary'
    case 1:
      return 'bg-info/25'
    case 2:
      return 'bg-info/45'
    case 3:
      return 'bg-info/65'
    default:
      return 'bg-info/90'
  }
}

function TokensByModelTable({ rows }: { rows: claudeinsight.ModelTokens[] }) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-sm font-medium">
        按模型统计 Token
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">模型</th>
              <th className="px-3 py-2 text-right font-medium">消息</th>
              <th className="px-3 py-2 text-right font-medium">Input</th>
              <th className="px-3 py-2 text-right font-medium">Output</th>
              <th className="px-3 py-2 text-right font-medium">Cache 写</th>
              <th className="px-3 py-2 text-right font-medium">Cache 读</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{r.messages.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatTokens(r.input_tokens)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatTokens(r.output_tokens)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatTokens(r.cache_creation_tokens)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{formatTokens(r.cache_read_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LongestSessionBanner({ s }: { s?: claudeinsight.SessionSummary }) {
  if (!s) return null
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-gradient-to-r from-info/10 to-transparent px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-info" />
        最长会话
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-mono" title={s.project}>
          {s.project || '—'}
        </span>
      </div>
      <BannerMetric label="消息" value={s.messages.toLocaleString()} />
      <BannerMetric label="时长" value={formatDuration(s.duration_sec)} />
      <BannerMetric
        label="时间"
        value={`${formatDate(s.started_at)} → ${formatDate(s.ended_at)}`}
      />
    </div>
  )
}

function BannerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  )
}

function RecentSessionsList({ list }: { list: claudeinsight.SessionSummary[] }) {
  if (list.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">最近会话</h3>
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-info" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={s.project}>
              {shortenProject(s.project)}
            </span>
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {s.messages} 条
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatRelative(s.ended_at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

