import { useState } from 'react'
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { CheckSSLCert } from '../../../../wailsjs/go/main/App'
import type { netscan } from '../../../../wailsjs/go/models'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Result = netscan.SSLResult
type Cert = netscan.SSLCertificate

export function SslTab() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('443')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const onSubmit = async () => {
    const h = host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!h) return
    setLoading(true)
    try {
      setResult(await CheckSSLCert(h, parseInt(port) || 443))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) onSubmit()
          }}
          placeholder="example.com 或 1.2.3.4"
          spellCheck={false}
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring"
        />
        <span className="text-muted-foreground">:</span>
        <input
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="443"
          className="h-9 w-20 rounded-md border border-input bg-background px-3 text-center font-mono text-sm outline-none focus:border-ring"
        />
        <Button onClick={onSubmit} disabled={loading || !host.trim()} className="px-6 font-semibold">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          查询
        </Button>
      </div>

      {result && <ResultView result={result} />}
      {!result && !loading && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          输入域名后点查询。例如 <code className="font-mono">github.com</code>
        </div>
      )}
    </div>
  )
}

function ResultView({ result }: { result: Result }) {
  if (result.error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
        <AlertCircle className="h-4 w-4" />
        <span className="font-mono">{result.error}</span>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-xs">
        <span className="font-mono font-semibold text-foreground">
          {result.host}:{result.port}
        </span>
        <Badge ok={!!result.protocol} icon={<Lock className="h-3 w-3" />}>
          {result.protocol || '—'}
        </Badge>
        {result.cipherSuite && (
          <Badge>
            <span className="font-mono">{result.cipherSuite}</span>
          </Badge>
        )}
        <Badge ok={result.chainValid}>{result.chainValid ? '链验签通过' : '链验签失败'}</Badge>
        <Badge ok={result.hostnameOK}>{result.hostnameOK ? 'Hostname 匹配' : 'Hostname 不匹配'}</Badge>
      </div>
      {(result.chain ?? []).map((cert, i) => (
        <CertCard key={i} cert={cert} index={i} total={result.chain?.length ?? 0} />
      ))}
    </div>
  )
}

function Badge({ ok, icon, children }: { ok?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  const cls =
    ok === undefined
      ? 'bg-secondary text-foreground'
      : ok
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : 'bg-red-500/15 text-red-700 dark:text-red-300'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]', cls)}>
      {icon ?? (ok === true ? <Check className="h-3 w-3" /> : ok === false ? <X className="h-3 w-3" /> : null)}
      {children}
    </span>
  )
}

function CertCard({ cert, index, total }: { cert: Cert; index: number; total: number }) {
  const [open, setOpen] = useState(index === 0)
  const expired = cert.daysRemaining < 0
  const expiringSoon = cert.daysRemaining >= 0 && cert.daysRemaining < 30
  const role = index === 0 ? '叶子证书' : index === total - 1 ? '根 / 顶级' : '中间证书'
  return (
    <div className="rounded-lg border border-border bg-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {expired ? (
          <ShieldAlert className="h-4 w-4 text-red-500" />
        ) : expiringSoon ? (
          <ShieldAlert className="h-4 w-4 text-amber-500" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
        )}
        <span className="text-sm font-medium">{cert.commonName || cert.subject}</span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{role}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {expired ? `已过期 ${-cert.daysRemaining} 天` : `剩 ${cert.daysRemaining} 天`}
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-3 text-xs">
          <KV label="Subject" value={cert.subject} mono />
          <KV label="Issuer" value={cert.issuer} mono />
          <KV
            label="有效期"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                {cert.notBefore?.slice(0, 10)} → {cert.notAfter?.slice(0, 10)}
              </span>
            }
          />
          <KV label="签名算法" value={cert.signatureAlgorithm} />
          <KV label="公钥算法" value={cert.publicKeyAlgorithm} />
          <KV label="Serial" value={cert.serialNumber} mono />
          {cert.dnsNames && cert.dnsNames.length > 0 && (
            <KV
              label={`SAN (${cert.dnsNames.length})`}
              value={
                <div className="flex flex-wrap gap-1">
                  {cert.dnsNames.map((n) => (
                    <span key={n} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">
                      <Globe className="h-3 w-3 text-muted-foreground" />
                      {n}
                    </span>
                  ))}
                </div>
              }
            />
          )}
        </div>
      )}
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('flex-1 break-all', mono && 'font-mono')}>{value}</span>
    </div>
  )
}
