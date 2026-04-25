import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const CAP = 20

interface RecentState {
  /** LRU:最近打开的工具 id,最新的在前 */
  ids: string[]
  /** 每个工具被打开的累计次数,用于命令面板的高频加权 */
  counts: Record<string, number>
  push: (id: string) => void
  clear: () => void
}

/**
 * 最近使用 + 使用计数。Sidebar 顶部 "最近使用" 用 ids,
 * CommandPalette 的查询模式用 counts 加权,空 query 模式用 ids 直接展示。
 */
export const useRecentToolsStore = create<RecentState>()(
  persist(
    (set) => ({
      ids: [],
      counts: {},
      push: (id) =>
        set((s) => {
          if (!id) return s
          const next = [id, ...s.ids.filter((x) => x !== id)]
          if (next.length > CAP) next.length = CAP
          return {
            ids: next,
            counts: { ...s.counts, [id]: (s.counts[id] ?? 0) + 1 },
          }
        }),
      clear: () => set({ ids: [], counts: {} }),
    }),
    { name: 'tool-forge:recent-tools' },
  ),
)
