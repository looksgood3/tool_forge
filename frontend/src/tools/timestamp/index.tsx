import { useEffect, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { ToolShell } from '@/components/tool/ToolShell'
import { ModeToggle } from '@/components/tool/ModeToggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { meta } from './meta'
import {
  dateToTimestamp,
  formatDate,
  formatIsoUtc,
  timestampToDate,
  type Unit,
} from './logic'

export default function Timestamp() {
  const [unit, setUnit] = useState<Unit>('s')
  const [tsInput, setTsInput] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const tsResult = useMemo(() => {
    if (!tsInput.trim()) return { local: '', utc: '', error: '' }
    try {
      const date = timestampToDate(tsInput, unit)
      return { local: formatDate(date), utc: formatIsoUtc(date), error: '' }
    } catch (e) {
      return {
        local: '',
        utc: '',
        error: e instanceof Error ? e.message : '解析失败',
      }
    }
  }, [tsInput, unit])

  const dateResult = useMemo(() => {
    if (!dateInput.trim()) return { ts: '', error: '' }
    try {
      return { ts: String(dateToTimestamp(dateInput, unit)), error: '' }
    } catch (e) {
      return { ts: '', error: e instanceof Error ? e.message : '解析失败' }
    }
  }, [dateInput, unit])

  const currentTs = unit === 's' ? Math.floor(now / 1000) : now

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      onClear={() => {
        setTsInput('')
        setDateInput('')
      }}
      actions={
        <ModeToggle
          value={unit}
          onChange={setUnit}
          options={[
            { value: 's', label: '秒' },
            { value: 'ms', label: '毫秒' },
          ]}
        />
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">当前时间戳（{unit === 's' ? '秒' : '毫秒'}）</div>
            <div className="font-mono text-lg font-medium">{currentTs}</div>
          </div>
          <CopyButton value={String(currentTs)} />
        </div>

        <Section
          label="时间戳 → 日期"
          placeholder={`输入时间戳（${unit === 's' ? '秒' : '毫秒'}）…`}
          value={tsInput}
          onChange={setTsInput}
          error={tsResult.error}
          onUseNow={() => setTsInput(String(currentTs))}
        >
          {tsResult.local && (
            <div className="space-y-2 pt-3">
              <OutputRow label="本地时间" value={tsResult.local} />
              <OutputRow label="UTC (ISO)" value={tsResult.utc} />
            </div>
          )}
        </Section>

        <Section
          label="日期 → 时间戳"
          placeholder="输入日期，如 2024-06-01 12:00:00"
          value={dateInput}
          onChange={setDateInput}
          error={dateResult.error}
        >
          {dateResult.ts && (
            <div className="pt-3">
              <OutputRow
                label={`时间戳（${unit === 's' ? '秒' : '毫秒'}）`}
                value={dateResult.ts}
              />
            </div>
          )}
        </Section>
      </div>
    </ToolShell>
  )
}

function Section({
  label,
  placeholder,
  value,
  onChange,
  error,
  onUseNow,
  children,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  error?: string
  onUseNow?: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {onUseNow && (
          <button
            onClick={onUseNow}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            用当前
          </button>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          'h-10 w-full rounded-md border bg-background px-3 font-mono text-sm outline-none focus:ring-1',
          error ? 'border-destructive focus:ring-destructive' : 'border-input focus:ring-ring'
        )}
      />
      {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
      {children}
    </div>
  )
}

function OutputRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-sm">{value}</div>
      </div>
      <CopyButton value={value} />
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? '已复制' : '复制'}
    </Button>
  )
}
