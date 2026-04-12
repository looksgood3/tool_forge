import { GitCompare } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'text-diff',
  path: '/tools/text-diff',
  title: '文本对比',
  description: '两段文本逐行差异对比，支持忽略空白',
  icon: GitCompare,
  category: 'text',
  order: 10,
  defaultVisible: true,
}
