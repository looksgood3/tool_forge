import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { ToolShell } from '@/components/tool/ToolShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { meta } from './meta'
import { computeRows, summarize, type DiffRow } from './logic'

const EXAMPLE_LEFT = `const greet = (name) => {
  return 'Hello, ' + name
}

console.log(greet('World'))`

const EXAMPLE_RIGHT = `const greet = (name: string): string => {
  return \`Hello, \${name}!\`
}

console.log(greet('Tool Forge'))`

export default function TextDiff() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [ignoreWs, setIgnoreWs] = useState(false)

  const rows = useMemo(() => computeRows(left, right, ignoreWs), [left, right, ignoreWs])
  const summary = useMemo(() => summarize(rows), [rows])
  const hasInput = left || right

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      onClear={() => {
        setLeft('')
        setRight('')
      }}
      onLoadExample={() => {
        setLeft(EXAMPLE_LEFT)
        setRight(EXAMPLE_RIGHT)
      }}
      actions={
        <>
          <Toggle checked={ignoreWs} onChange={setIgnoreWs} label="忽略空白" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const tmp = left
              setLeft(right)
              setRight(tmp)
            }}
            title="交换"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
        </>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <div className="grid flex-1 min-h-[200px] grid-cols-1 gap-4 lg:grid-cols-2">
          <Editor label="原文" value={left} onChange={setLeft} />
          <Editor label="修改后" value={right} onChange={setRight} />
        </div>

        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="text-xs font-medium text-muted-foreground">差异</span>
            {hasInput && (
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{summary.adds}
                </span>
                <span className="text-destructive">-{summary.removes}</span>
                <span className="text-amber-600 dark:text-amber-400">
                  ~{summary.changes}
                </span>
              </div>
            )}
          </div>
          {hasInput ? (
            <DiffTable rows={rows} />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              在上方输入两段文本即可对比
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  )
}

function Editor({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="h-9 shrink-0 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="粘贴文本…"
        className="flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  )
}

function DiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="max-h-[340px] overflow-auto">
      <table className="w-full border-collapse font-mono text-[12px]">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              <td className="w-10 select-none bg-muted/30 px-2 py-0.5 text-right text-muted-foreground">
                {row.leftNo ?? ''}
              </td>
              <td
                className={cn(
                  'w-1/2 whitespace-pre-wrap break-all px-2 py-0.5',
                  row.kind === 'remove' && 'bg-destructive/10 text-destructive'
                )}
              >
                {row.leftText || '\u00A0'}
              </td>
              <td className="w-10 select-none bg-muted/30 px-2 py-0.5 text-right text-muted-foreground">
                {row.rightNo ?? ''}
              </td>
              <td
                className={cn(
                  'w-1/2 whitespace-pre-wrap break-all px-2 py-0.5',
                  row.kind === 'add' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                  row.kind === 'remove' &&
                    row.rightNo !== null &&
                    'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                )}
              >
                {row.rightText || '\u00A0'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
        checked
          ? 'border-foreground/30 bg-accent font-medium'
          : 'border-input bg-background hover:bg-accent'
      )}
    >
      <span
        className={cn(
          'h-3 w-3 rounded-sm border',
          checked ? 'border-foreground bg-foreground' : 'border-muted-foreground/40'
        )}
      />
      {label}
    </button>
  )
}
