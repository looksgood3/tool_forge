import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function DialogShell({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <DialogShell open={open} onClose={onCancel}>
      <div className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{message}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-secondary/30 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          size="sm"
          variant={destructive ? 'destructive' : 'default'}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel}
        </Button>
      </div>
    </DialogShell>
  )
}

export function PromptDialog({
  open,
  title,
  label,
  defaultValue = '',
  placeholder,
  confirmLabel = '确定',
  cancelLabel = '取消',
  validate,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  label: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  validate?: (v: string) => string | null
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(defaultValue)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      setErr(null)
    }
  }, [open, defaultValue])

  const submit = () => {
    const v = value.trim()
    if (!v) {
      setErr('不能为空')
      return
    }
    if (validate) {
      const msg = validate(v)
      if (msg) {
        setErr(msg)
        return
      }
    }
    onConfirm(v)
  }

  return (
    <DialogShell open={open} onClose={onCancel}>
      <div className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (err) setErr(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={placeholder}
            className={cn(
              'h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-foreground/30',
              err ? 'border-red-500/60' : 'border-border'
            )}
          />
          {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-secondary/30 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button size="sm" onClick={submit}>
          {confirmLabel}
        </Button>
      </div>
    </DialogShell>
  )
}

// 防未使用告警(X 暂时没直接用但保留以备扩展)
void X
