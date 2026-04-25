import { useState } from 'react'
import { AlertCircle, Loader2, Search } from 'lucide-react'
import { LookupDNSRecords } from '../../../../wailsjs/go/main/App'
import type { netscan } from '../../../../wailsjs/go/models'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Result = netscan.DNSResult

const ALL_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'] as const

export function DnsTab() {
  const [domain, setDomain] = useState('')
  const [types, setTypes] = useState<Set<string>>(new Set(ALL_TYPES))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const onSubmit = async () => {
    const d = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!d) return
    setLoading(true)
    try {
      setResult(await LookupDNSRecords(d, Array.from(types)))
    } finally {
      setLoading(false)
    }
  }

  const toggleType = (t: string) => {
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) onSubmit()
          }}
          placeholder="example.com"
          spellCheck={false}
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring"
        />
        <Button onClick={onSubmit} disabled={loading || !domain.trim()} className="px-6 font-semibold">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          查询
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">记录类型</span>
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-mono transition-colors',
              types.has(t)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {result && <ResultView result={result} />}
      {!result && !loading && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          输入域名后点查询
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
  const grouped: Record<string, string[]> = {}
  for (const r of result.records ?? []) {
    if (!grouped[r.type]) grouped[r.type] = []
    grouped[r.type].push(r.value)
  }
  return (
    <div className="space-y-2">
      {Object.keys(grouped).map((k) => (
        <div key={k} className="rounded-lg border border-border bg-card">
          <div className="border-b border-border/60 bg-secondary/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {k} ({grouped[k].length})
          </div>
          <div className="divide-y divide-border/40">
            {grouped[k].map((v, i) => (
              <div key={i} className="px-3 py-1.5 font-mono text-xs">
                {v}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
