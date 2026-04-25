import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pin, PinOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  x: number
  y: number
  pinned: boolean
  /** 已达上限且当前未收藏:点击应被禁用 */
  full: boolean
  onToggle: () => void
  onClose: () => void
}

export function ToolContextMenu({ x, y, pinned, full, onToggle, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // 边界翻转:菜单尺寸要等首次渲染后量
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    setPos({
      x: x + w + 8 > vw ? Math.max(4, vw - w - 4) : x,
      y: y + h + 8 > vh ? Math.max(4, vh - h - 4) : y,
    })
  }, [x, y])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // mousedown 而不是 click,避免菜单刚弹出就被同一个 right-click 的 mouseup 关掉
    setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const disabled = !pinned && full
  const Icon = pinned ? PinOff : Pin
  const label = pinned ? '取消收藏' : full ? '收藏夹已满（5 项）' : '收藏到顶部'

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[200] min-w-[160px] rounded-md border border-border bg-card py-1 shadow-lg animate-in fade-in zoom-in-95"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          onToggle()
          onClose()
        }}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
          disabled
            ? 'cursor-not-allowed text-muted-foreground'
            : 'hover:bg-accent hover:text-foreground',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
    </div>,
    document.body,
  )
}
