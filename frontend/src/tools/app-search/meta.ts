import { Search } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'app-search',
  path: '/tools/app-search',
  title: '包名搜索',
  description: '跨 iTunes / 七麦 / 应用宝 / Google Play 查 iOS bundleId 与 Android 包名',
  icon: Search,
  category: 'forensic',
  order: 2,
  defaultVisible: true,
}
