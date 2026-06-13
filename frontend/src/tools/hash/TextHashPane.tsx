import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { HASH_ALGOS, computeAll, type HashAlgo } from './logic'
import { ModeToggle } from '@/components/tool/ModeToggle'
import { cn } from '@/lib/utils'

type Case = 'lower' | 'upper'

export function TextHashPane() {
  const [input, setInput] = useState('')
  const [casing, setCasing] = useState<Case>('lower')

  const results = useMemo(() => (input ? computeAll(input) : null), [input])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          文本哈希在前端本地计算(MD5 / SHA-1 / SHA-256 / SHA-512)
        </span>
        <ModeToggle
          value={casing}
          onChange={setCasing}
          options={[
            { value: 'lower', label: '小写' },
            { value: 'upper', label: '大写' },
          ]}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          输入文本
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入要计算哈希的文本…"
          spellCheck={false}
          className="min-h-[140px] w-full resize-y bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="space-y-2">
        {HASH_ALGOS.map((algo) => (
          <TextHashRow
            key={algo}
            algo={algo}
            value={results ? transform(results[algo], casing) : ''}
          />
        ))}
      </div>
    </div>
  )
}

function transform(value: string, casing: Case): string {
  return casing === 'upper' ? value.toUpperCase() : value.toLowerCase()
}

function TextHashRow({ algo, value }: { algo: HashAlgo; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-semibold text-muted-foreground">{algo}</span>
      <code className={cn('flex-1 truncate font-mono text-sm', !value && 'text-muted-foreground/60')}>
        {value || '等待输入…'}
      </code>
      <button
        disabled={!value}
        onClick={async () => {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <Copy className="inline h-3 w-3" /> {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}
