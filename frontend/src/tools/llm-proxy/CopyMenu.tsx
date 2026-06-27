import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface CopyItem {
  label: string
  value: string
}

// CopyMenu 复制下拉:列出若干"标签 → 待复制值",点击即复制(并短暂打勾)。
// 接入地址多了也不会撑乱工具栏。
export function CopyMenu({ label, items, disabled }: { label: string; items: CopyItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const copy = (it: CopyItem) => {
    navigator.clipboard.writeText(it.value).then(() => {
      setCopied(it.value)
      window.setTimeout(() => setCopied(''), 1200)
    })
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <Button variant="outline" size="sm" disabled={disabled || items.length === 0} onClick={() => setOpen((v) => !v)}>
        <Copy className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </Button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 min-w-[260px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md">
          {items.map((it) => (
            <button
              key={it.value}
              onClick={() => copy(it)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"
            >
              {copied === it.value ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block text-xs font-medium">{it.label}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{it.value}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
