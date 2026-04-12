import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LucideIcon } from 'lucide-react'
import { toolRegistry } from '@/tools/registry'

export type ToolCategory =
  | 'data'
  | 'codec'
  | 'crypto'
  | 'time'
  | 'text'
  | 'network'
  | 'gen'
  | 'dev'

export interface ToolMeta {
  id: string
  path: string
  title: string
  description: string
  icon: LucideIcon
  category: ToolCategory
  order: number
  defaultVisible?: boolean
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  data: '数据处理',
  codec: '编解码',
  crypto: '加密哈希',
  time: '时间',
  text: '文本',
  network: '网络',
  gen: '生成',
  dev: '开发辅助',
}

interface ToolsState {
  visibility: Record<string, boolean>
  order: string[]
  toggleVisibility: (id: string) => void
  setOrder: (order: string[]) => void
}

export const useToolsStore = create<ToolsState>()(
  persist(
    (set) => ({
      visibility: {},
      order: [],
      toggleVisibility: (id) =>
        set((s) => ({
          visibility: { ...s.visibility, [id]: !(s.visibility[id] ?? true) },
        })),
      setOrder: (order) => set({ order }),
    }),
    { name: 'tool-forge:tools' }
  )
)

export function getAllTools(): ToolMeta[] {
  return [...toolRegistry].sort((a, b) => a.order - b.order)
}

export function getVisibleToolsByCategory(
  visibility: Record<string, boolean>
): Record<ToolCategory, ToolMeta[]> {
  const grouped = {} as Record<ToolCategory, ToolMeta[]>
  for (const tool of getAllTools()) {
    const visible = visibility[tool.id] ?? tool.defaultVisible ?? true
    if (!visible) continue
    ;(grouped[tool.category] ||= []).push(tool)
  }
  return grouped
}

export function getToolById(id: string): ToolMeta | undefined {
  return toolRegistry.find((t) => t.id === id)
}
