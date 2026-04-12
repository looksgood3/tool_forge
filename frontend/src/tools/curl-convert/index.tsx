import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { ToolShell } from '@/components/tool/ToolShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { meta } from './meta'
import { parseCurl } from './parser'
import { TARGETS } from './generators'

const EXAMPLE = `curl -X POST 'https://api.example.com/users' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer xyz' \\
  -d '{"name":"Alice","age":30}'`

export default function CurlConvert() {
  const [input, setInput] = useState('')
  const [activeId, setActiveId] = useState(TARGETS[0].id)
  const [copied, setCopied] = useState(false)

  const { outputs, error } = useMemo(() => {
    if (!input.trim()) return { outputs: {}, error: '' }
    try {
      const req = parseCurl(input)
      const result: Record<string, string> = {}
      for (const t of TARGETS) {
        try {
          result[t.id] = t.render(req)
        } catch (e) {
          result[t.id] = `// 生成失败: ${e instanceof Error ? e.message : e}`
        }
      }
      return { outputs: result, error: '' }
    } catch (e) {
      return { outputs: {}, error: e instanceof Error ? e.message : '解析失败' }
    }
  }, [input])

  const active = TARGETS.find((t) => t.id === activeId)!
  const output = outputs[activeId] ?? ''

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      onClear={() => setInput('')}
      onLoadExample={() => setInput(EXAMPLE)}
    >
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="text-xs font-medium text-muted-foreground">cURL 命令</span>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴 cURL 命令（支持反斜杠换行）"
            spellCheck={false}
            className="flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-1 py-1">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={cn(
                  'whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors',
                  activeId === t.id
                    ? 'bg-background font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto pr-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={!output}
                onClick={async () => {
                  await navigator.clipboard.writeText(output)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1200)
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
          </div>
          <pre className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed">
            {output || <span className="text-muted-foreground/60">等待输入 cURL 命令…</span>}
          </pre>
          <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            {active.language}
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
