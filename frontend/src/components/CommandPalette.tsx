import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Clock, Search } from 'lucide-react'
import { CATEGORY_LABELS, type ToolMeta } from '@/stores/tools'
import { toolRegistry } from '@/tools/registry'
import { useRecentToolsStore } from '@/stores/recentTools'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

interface ScoredItem {
  tool: ToolMeta
  score: number
  /** highlightRanges: 命中位置,用于在 title 上加粗显示 */
  matches: number[]
}

/** 简易 fuzzy 评分：
 *  - 全字符按顺序命中 title → 基础分;越靠前、越连续得分越高
 *  - description 命中得低分
 *  - id 完全匹配直接置顶
 *  返回 null 表示完全不匹配。
 */
function fuzzyScore(
  query: string,
  tool: ToolMeta,
): { score: number; matches: number[] } | null {
  const q = query.trim().toLowerCase()
  if (!q) return { score: 0, matches: [] }
  const title = tool.title.toLowerCase()
  if (tool.id.toLowerCase() === q) return { score: 10000, matches: [] }
  if (title.startsWith(q)) return { score: 5000 + (100 - title.length), matches: range(0, q.length) }
  if (title.includes(q)) {
    const idx = title.indexOf(q)
    return { score: 3000 - idx * 5, matches: range(idx, idx + q.length) }
  }
  // 字符顺序命中
  const matches: number[] = []
  let i = 0
  let prev = -1
  let runs = 0
  for (let c = 0; c < title.length && i < q.length; c++) {
    if (title[c] === q[i]) {
      matches.push(c)
      if (prev === c - 1) runs++
      prev = c
      i++
    }
  }
  if (i === q.length) {
    // 命中全部字符
    return { score: 1500 + runs * 30 - matches[0] * 3, matches }
  }
  // 退回到 description
  const desc = tool.description.toLowerCase()
  if (desc.includes(q)) return { score: 500 - desc.indexOf(q) * 2, matches: [] }
  return null
}

function range(a: number, b: number): number[] {
  const out: number[] = []
  for (let i = a; i < b; i++) out.push(i)
  return out
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const recentIds = useRecentToolsStore((s) => s.ids)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 打开时聚焦 input,重置 query / active
  useLayoutEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // 等 portal mount 再聚焦
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const items = useMemo<ScoredItem[]>(() => {
    const q = query.trim()
    if (!q) {
      // 空 query: 显示最近 + 其他
      const byId = new Map(toolRegistry.map((t) => [t.id, t]))
      const recents: ScoredItem[] = []
      for (const id of recentIds) {
        const t = byId.get(id)
        if (t) recents.push({ tool: t, score: 0, matches: [] })
      }
      const recentSet = new Set(recentIds)
      const rest = toolRegistry
        .filter((t) => !recentSet.has(t.id))
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ tool: t, score: 0, matches: [] as number[] }))
      return [...recents, ...rest].slice(0, 30)
    }
    const scored: ScoredItem[] = []
    for (const tool of toolRegistry) {
      const r = fuzzyScore(q, tool)
      if (r) scored.push({ tool, score: r.score, matches: r.matches })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 30)
  }, [query, recentIds])

  const showingRecents = !query.trim() && recentIds.length > 0

  useEffect(() => {
    setActive(0)
  }, [query])

  const select = useCallback(
    (idx: number) => {
      const item = items[idx]
      if (!item) return
      onClose()
      navigate(`/tools/${item.tool.id}`)
    },
    [items, navigate, onClose],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      select(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // 激活项滚进可视区
  useEffect(() => {
    if (!open) return
    const root = listRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(`[data-row="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[15vh]"
      onMouseDown={(e) => {
        // 点击背景关闭
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="跳转到工具..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            spellCheck={false}
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-auto py-1">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              找不到匹配工具
            </div>
          ) : (
            <>
              {showingRecents && (
                <SectionHeader icon={<Clock className="h-3 w-3" />} label="最近使用" />
              )}
              {items.map((it, i) => (
                <Row
                  key={it.tool.id}
                  item={it}
                  query={query}
                  active={i === active}
                  index={i}
                  onHover={setActive}
                  onSelect={select}
                />
              ))}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border bg-secondary/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <HintKey label="↑↓" desc="选择" />
            <HintKey label="↵" desc="打开" />
            <HintKey label="Esc" desc="关闭" />
          </div>
          <span>共 {items.length} 项</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </div>
  )
}

function Row({
  item,
  query,
  active,
  index,
  onHover,
  onSelect,
}: {
  item: ScoredItem
  query: string
  active: boolean
  index: number
  onHover: (i: number) => void
  onSelect: (i: number) => void
}) {
  const Icon = item.tool.icon
  return (
    <div
      data-row={index}
      onMouseMove={() => onHover(index)}
      onClick={() => onSelect(index)}
      className={cn(
        'mx-1 flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors',
        active ? 'bg-indigo-500/15 text-foreground' : 'text-foreground/85 hover:bg-secondary/60',
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          active ? 'text-indigo-600 dark:text-indigo-300' : 'text-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          <Highlighted text={item.tool.title} query={query} matches={item.matches} />
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {item.tool.description}
        </div>
      </div>
      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {CATEGORY_LABELS[item.tool.category]}
      </span>
    </div>
  )
}

/** 命中字符加粗；matches 为空时用 substring 查找兜底 */
function Highlighted({
  text,
  query,
  matches,
}: {
  text: string
  query: string
  matches: number[]
}) {
  if (!query.trim()) return <>{text}</>
  const set = new Set(matches)
  if (set.size > 0) {
    return (
      <>
        {text.split('').map((ch, i) => (
          <span
            key={i}
            className={cn(set.has(i) && 'font-semibold text-indigo-600 dark:text-indigo-300')}
          >
            {ch}
          </span>
        ))}
      </>
    )
  }
  // substring 兜底
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-indigo-600 dark:text-indigo-300">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  )
}

function HintKey({ label, desc }: { label: string; desc: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">
        {label}
      </kbd>
      {desc}
    </span>
  )
}
