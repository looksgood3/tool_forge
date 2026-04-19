import { Bot } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'codex-insight',
  path: '/tools/codex-insight',
  title: 'Codex 洞察',
  description: '扫描本地 ~/.codex 目录,展示会话、Token 用量与活跃度统计',
  icon: Bot,
  category: 'ai',
  order: 11,
  defaultVisible: true,
}
