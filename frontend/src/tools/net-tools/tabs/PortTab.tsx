import { useMemo, useState } from 'react'
import { AlertCircle, Check, Loader2, Radar, X } from 'lucide-react'
import { ScanPorts } from '../../../../wailsjs/go/main/App'
import type { netscan } from '../../../../wailsjs/go/models'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Result = netscan.PortResult

const PRESETS: { label: string; ports: string }[] = [
  { label: 'Web 常用', ports: '80, 443, 8080, 8443' },
  { label: 'SSH / DB', ports: '22, 3306, 5432, 6379, 27017' },
  { label: '开发常用', ports: '3000, 5173, 8000, 8080, 9000' },
]

export function PortTab() {
  const [host, setHost] = useState('')
  const [portsText, setPortsText] = useState('80, 443')
  const [timeout, setTimeout] = useState('1500')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const parsedPorts = useMemo(() => parsePorts(portsText), [portsText])

  const onSubmit = async () => {
    const h = host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!h || parsedPorts.length === 0) return
    setLoading(true)
    try {
      setResult(await ScanPorts(h, parsedPorts, parseInt(timeout) || 1500))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) onSubmit()
            }}
            placeholder="主机 / IP, 例如 example.com"
            spellCheck={false}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring"
          />
          <input
            value={timeout}
            onChange={(e) => setTimeout(e.target.value)}
            placeholder="超时 ms"
            className="h-9 w-24 rounded-md border border-input bg-background px-3 text-center font-mono text-sm outline-none focus:border-ring"
            title="单端口连接超时(毫秒)"
          />
          <Button
            onClick={onSubmit}
            disabled={loading || !host.trim() || parsedPorts.length === 0}
            className="px-6 font-semibold"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radar className="h-3.5 w-3.5" />}
            扫描 ({parsedPorts.length})
          </Button>
        </div>
        <input
          value={portsText}
          onChange={(e) => setPortsText(e.target.value)}
          placeholder="端口列表,例如 80, 443, 8000-8010"
          className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring"
        />
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">预设</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPortsText(p.ports)}
              className="rounded-full px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {result && <ResultView result={result} />}
      {!result && !loading && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          输入主机和端口列表后点扫描。支持 <code className="font-mono">80, 443</code> 或区间 <code className="font-mono">8000-8010</code>
        </div>
      )}
    </div>
  )
}

function ResultView({ result }: { result: Result }) {
  if (result.error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
        <AlertCircle className="h-4 w-4" />
        {result.error}
      </div>
    )
  }
  const open = (result.ports ?? []).filter((p) => p.open).length
  const total = (result.ports ?? []).length
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        共 {total} 个端口,{open} 个开放
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {(result.ports ?? []).map((p) => (
          <div
            key={p.port}
            className={cn(
              'flex items-center gap-2 rounded-lg border p-2 text-xs',
              p.open ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded',
                p.open
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                  : 'bg-secondary text-muted-foreground'
              )}
            >
              {p.open ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            <span className="font-mono font-semibold">{p.port}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {p.open ? `${p.latency}ms` : p.error || '关闭'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function parsePorts(text: string): number[] {
  const set = new Set<number>()
  for (const part of text.split(/[,;\s]+/)) {
    const p = part.trim()
    if (!p) continue
    const range = p.match(/^(\d+)-(\d+)$/)
    if (range) {
      const a = parseInt(range[1])
      const b = parseInt(range[2])
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      for (let i = lo; i <= hi; i++) {
        if (i >= 1 && i <= 65535) set.add(i)
      }
    } else {
      const n = parseInt(p)
      if (!Number.isNaN(n) && n >= 1 && n <= 65535) set.add(n)
    }
  }
  return Array.from(set).sort((a, b) => a - b)
}
