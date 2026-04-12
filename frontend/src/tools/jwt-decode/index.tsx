import { useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { ToolShell } from '@/components/tool/ToolShell'
import { TextPanel } from '@/components/tool/TextPanel'
import { cn } from '@/lib/utils'
import { meta } from './meta'
import { decodeJwt, type JwtDecoded } from './logic'

const EXAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRvb2wgRm9yZ2UiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0.' +
  'signature-placeholder'

export default function JwtDecode() {
  const [token, setToken] = useState('')

  const { decoded, error } = useMemo(() => {
    if (!token.trim()) return { decoded: null, error: '' }
    try {
      return { decoded: decodeJwt(token), error: '' }
    } catch (e) {
      return {
        decoded: null,
        error: e instanceof Error ? e.message : '解析失败',
      }
    }
  }, [token])

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      onClear={() => setToken('')}
      onLoadExample={() => setToken(EXAMPLE)}
    >
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-2">
        <TextPanel
          label="JWT Token"
          value={token}
          onChange={setToken}
          placeholder="粘贴 JWT…（支持以 Bearer 开头）"
          error={error}
        />
        <div className="flex flex-col gap-4 overflow-auto">
          {decoded ? (
            <Decoded decoded={decoded} />
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-card/50 text-sm text-muted-foreground">
              {error ? '无法解析，请检查 Token' : '左侧输入 JWT 即可解析'}
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  )
}

function Decoded({ decoded }: { decoded: JwtDecoded }) {
  return (
    <>
      {decoded.expiresAt && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
            decoded.isExpired
              ? 'bg-destructive/10 text-destructive'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          )}
        >
          {decoded.isExpired ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <span>
            {decoded.isExpired ? '已过期' : '有效'} · {decoded.expiresAt.toLocaleString()}
          </span>
        </div>
      )}

      <JsonBlock label="Header" data={decoded.header} />
      <JsonBlock label="Payload" data={decoded.payload} />
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-1 text-xs font-medium text-muted-foreground">Signature</div>
        <div className="break-all font-mono text-xs">{decoded.signature}</div>
      </div>
    </>
  )
}

function JsonBlock({ label, data }: { label: string; data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <pre className="overflow-auto p-3 font-mono text-xs leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
