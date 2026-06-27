import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Modal 轻量弹窗:遮罩 + 居中面板,Esc / 点遮罩 / 关闭按钮 关闭。
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-2xl',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl',
          width
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" className="w-8 px-0" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  )
}
