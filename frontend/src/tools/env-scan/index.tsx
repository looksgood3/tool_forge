import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  Radar,
  RefreshCw,
} from 'lucide-react'
import { ToolShell } from '@/components/tool/ToolShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { meta } from './meta'
import { ScanEnvironments } from '../../../wailsjs/go/main/App'
import type { envscan } from '../../../wailsjs/go/models'

type Result = envscan.Result

const CATEGORY_LABELS: Record<string, string> = {
  language: '语言 / 运行时',
  package_manager: '包管理器',
  ai_cli: 'AI 命令行',
  toolchain: '工具链',
  database: '数据库客户端',
}

const CATEGORY_ORDER = [
  'language',
  'package_manager',
  'ai_cli',
  'toolchain',
  'database',
]

type Phase = 'idle' | 'scanning' | 'done'

export default function EnvScanTool() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [results, setResults] = useState<Result[]>([])
  const [scannedAt, setScannedAt] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const scan = async () => {
    setPhase('scanning')
    setCopied(false)
    try {
      const report = await ScanEnvironments()
      setResults(report.results ?? [])
      setScannedAt(report.scanned_at)
      setPhase('done')
    } catch (e) {
      setResults([])
      setScannedAt('')
      setPhase('idle')
      console.error('扫描失败', e)
    }
  }

  const copyReport = async () => {
    const text = buildReport(results, scannedAt)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const grouped = groupByCategory(results)
  const installedCount = results.filter((r) => r.status === 'installed').length

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      actions={
        phase === 'done' && (
          <>
            <Button variant="ghost" size="sm" onClick={copyReport}>
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? '已复制' : '复制报告'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={scan}
              disabled={phase !== 'done'}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重新扫描
            </Button>
          </>
        )
      }
    >
      {phase === 'idle' && <EmptyState onScan={scan} />}

      {phase === 'scanning' && <ScanningState />}

      {phase === 'done' && (
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              共检测到 <b className="text-foreground">{installedCount}</b> 个工具
              {results.length - installedCount > 0 && (
                <span>，{results.length - installedCount} 个存在但无法解析版本</span>
              )}
            </span>
            <span>{formatTime(scannedAt)}</span>
          </div>

          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
              没有检测到任何预置清单中的工具
            </div>
          ) : (
            CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((c) => (
              <CategorySection
                key={c}
                title={CATEGORY_LABELS[c] ?? c}
                items={grouped[c]}
              />
            ))
          )}
        </div>
      )}
    </ToolShell>
  )
}

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
        <Radar className="h-8 w-8" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-medium">扫描本机开发环境</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          点击下方按钮开始扫描。将检测本机安装的语言、包管理器、AI CLI、
          工具链与数据库客户端，并展示其版本。未安装的工具不会显示。
        </p>
      </div>
      <Button onClick={onScan} className="mt-2">
        <Radar className="h-4 w-4" />
        开始扫描
      </Button>
    </div>
  )
}

function ScanningState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      正在扫描...
    </div>
  )
}

function CategorySection({ title, items }: { title: string; items: Result[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <ResultCard key={it.name} item={it} />
        ))}
      </div>
    </section>
  )
}

function ResultCard({ item }: { item: Result }) {
  const ok = item.status === 'installed'
  return (
    <div className="group rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              ok
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-amber-500/15 text-amber-500'
            )}
          >
            {ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="truncate text-sm font-medium">{item.name}</span>
        </div>
        {ok && (
          <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {item.version}
          </span>
        )}
      </div>
      <div className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground" title={item.path}>
        {item.path}
      </div>
      {!ok && item.error && (
        <div className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          {item.error}
        </div>
      )}
    </div>
  )
}

function groupByCategory(results: Result[]): Record<string, Result[]> {
  const out: Record<string, Result[]> = {}
  for (const r of results) {
    ;(out[r.category] ||= []).push(r)
  }
  return out
}

function buildReport(results: Result[], scannedAt: string): string {
  const grouped = groupByCategory(results)
  const lines: string[] = []
  lines.push(`Tool Forge 开发环境扫描报告`)
  lines.push(`扫描时间: ${formatTime(scannedAt)}`)
  lines.push('')
  for (const c of CATEGORY_ORDER) {
    const items = grouped[c]
    if (!items?.length) continue
    lines.push(`## ${CATEGORY_LABELS[c] ?? c}`)
    for (const it of items) {
      if (it.status === 'installed') {
        lines.push(`- ${it.name}  ${it.version}  (${it.path})`)
      } else {
        lines.push(`- ${it.name}  [无法解析版本]  (${it.path})`)
      }
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}
