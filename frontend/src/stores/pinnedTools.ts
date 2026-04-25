import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const PINNED_LIMIT = 5

interface PinnedState {
  /** 用户固定到侧栏顶部 dock 的工具 id,按用户添加顺序保存 */
  ids: string[]
  /** 切换:已收藏则移除,未收藏且未满则追加;已满返回 false */
  toggle: (id: string) => boolean
  remove: (id: string) => void
  clear: () => void
}

export const usePinnedToolsStore = create<PinnedState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => {
        const cur = get().ids
        if (cur.includes(id)) {
          set({ ids: cur.filter((x) => x !== id) })
          return true
        }
        if (cur.length >= PINNED_LIMIT) return false
        set({ ids: [...cur, id] })
        return true
      },
      remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
      clear: () => set({ ids: [] }),
    }),
    { name: 'tool-forge:pinned-tools' },
  ),
)
