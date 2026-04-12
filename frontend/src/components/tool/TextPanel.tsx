import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TextPanelProps {
  label: string
  value: string
  onChange?: (v: string) => void
  error?: string
  readOnly?: boolean
  placeholder?: string
  minHeight?: string
  rightSlot?: ReactNode
}

export function TextPanel({
  label,
  value,
  onChange,
  error,
  readOnly,
  placeholder,
  minHeight = 'min-h-[280px]',
  rightSlot,
}: TextPanelProps) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border bg-card',
        minHeight
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          {rightSlot}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        placeholder={
          placeholder ?? (readOnly ? '结果将显示在这里…' : '输入内容…')
        }
        className={cn(
          'flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60',
          readOnly && 'cursor-default'
        )}
      />
    </div>
  )
}
