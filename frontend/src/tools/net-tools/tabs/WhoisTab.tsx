import { useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react'
import { LookupWhoisInfo } from '../../../../wailsjs/go/main/App'
import type { netscan } from '../../../../wailsjs/go/models'
import { Button } from '@/components/ui/button'

type Result = netscan.WhoisResult

const KEY_ORDER = [
  'Domain Name',
  'Registrar',
  'Registrar URL',
  'Registrar IANA ID',
  'Creation Date',
  'Updated Date',
  'Registry Expiry Date',
  'Registrant Organization',
  'Registrant Country',
  'Status',
  'Name Server',
  'DNSSEC',
]

export function WhoisTab() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const onSubmit = async () => {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!d) return
    setLoading(true)
    try {
      setResult(await LookupWhoisInfo(d))
      setShowRaw(false)
    } finally {
      setLoading(false)
    }
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

      {result && <ResultView result={result} showRaw={showRaw} setShowRaw={setShowRaw} />}
      {!result && !loading && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          输入域名后点查询。注:部分 TLD 不支持 WHOIS 或返回受限信息
        </div>
      )}
    </div>
  )
}

function ResultView({
  result,
  showRaw,
  setShowRaw,
}: {
  result: Result
  showRaw: boolean
  setShowRaw: (v: boolean) => void
}) {
  const orderedEntries = KEY_ORDER
    .filter((k) => result.parsed && result.parsed[k])
    .map((k) => ({ key: k, value: result.parsed[k] }))
  return (
    <div className="space-y-3">
      {result.error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4" />
          {result.error}
        </div>
      )}
      {result.server && (
        <div className="text-xs text-muted-foreground">
          数据源: <span className="font-mono">{result.server}</span>
        </div>
      )}
      {orderedEntries.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="divide-y divide-border/40">
            {orderedEntries.map((e) => (
              <div key={e.key} className="grid grid-cols-[160px_1fr] gap-3 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{e.key}</span>
                <span className="whitespace-pre-line break-all font-mono">{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {result.raw && (
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs"
          >
            {showRaw ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="font-medium">原始 WHOIS 响应</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{result.raw.length} 字符</span>
          </button>
          {showRaw && (
            <pre className="max-h-96 overflow-auto border-t border-border/60 bg-secondary/30 p-3 font-mono text-[11px] leading-relaxed">
              {result.raw}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
