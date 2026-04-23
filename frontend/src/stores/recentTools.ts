import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const CAP = 20

interface RecentState {
  ids: string[]
  push: (id: string) => void
  clear: () => void
}

/**
 * 最近使用的工具 id 列表（最新的在前）。命令面板里用作默认展示 + 排序加权。
 */
export const useRecentToolsStore = create<RecentState>()(
  persist(
    (set) => ({
      ids: [],
      push: (id) =>
        set((s) => {
          if (!id) return s
          const next = [id, ...s.ids.filter((x) => x !== id)]
          if (next.length > CAP) next.length = CAP
          return { ids: next }
        }),
      clear: () => set({ ids: [] }),
    }),
    { name: 'tool-forge:recent-tools' },
  ),
)
