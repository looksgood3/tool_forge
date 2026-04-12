import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Copy } from 'lucide-react'
import { json } from '@codemirror/lang-json'
import { ToolShell } from '@/components/tool/ToolShell'
import { CodeEditor } from '@/components/tool/CodeEditor'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { meta } from './meta'
import {
  escapeJson,
  formatJson,
  minifyJson,
  unescapeJson,
  validate,
} from './logic'

const EXAMPLE = `{"id":42,"name":"Tool Forge","tags":["dev","utils"],"active":true,"nested":{"a":1,"b":[1,2,3]}}`

export default function JsonEditor() {
  const [input, setInput] = useState('')
  const [opError, setOpError] = useState('')

  const status = useMemo(() => validate(input), [input])

  const apply = (fn: (s: string) => string) => {
    try {
      setInput(fn(input))
      setOpError('')
    } catch (e) {
      setOpError(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      onClear={() => {
        setInput('')
        setOpError('')
      }}
      onLoadExample={() => {
        setInput(EXAMPLE)
        setOpError('')
      }}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => apply((s) => formatJson(s, 2))}
            disabled={!input}
          >
            格式化
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => apply(minifyJson)}
            disabled={!input}
          >
            压缩
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => apply(escapeJson)}
            disabled={!input}
          >
            转义
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => apply(unescapeJson)}
            disabled={!input}
          >
            反转义
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(input)}
            disabled={!input}
          >
            <Copy className="h-3.5 w-3.5" />
            复制
          </Button>
        </div>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <StatusBadge status={status} hasInput={!!input} />
          {opError && <span className="text-destructive">{opError}</span>}
        </div>
        <CodeEditor
          value={input}
          onChange={setInput}
          extensions={[json()]}
          placeholder="粘贴 JSON…"
          className="flex-1 overflow-hidden rounded-lg border border-border"
          minHeight="100%"
        />
      </div>
    </ToolShell>
  )
}

function StatusBadge({
  status,
  hasInput,
}: {
  status: { valid: boolean; error?: string }
  hasInput: boolean
}) {
  if (!hasInput) {
    return <span className="text-muted-foreground">等待输入…</span>
  }
  if (status.valid) {
    return (
      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> 合法 JSON
      </span>
    )
  }
  return (
    <span
      className={cn(
        'flex items-center gap-1.5',
        status.error ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      <AlertCircle className="h-3.5 w-3.5" />
      {status.error || '格式错误'}
    </span>
  )
}
