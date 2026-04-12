import { Smartphone } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'mobile-forensic',
  path: '/tools/mobile-forensic',
  title: '移动取证',
  description: '基于 go-forensic 拉取 Android / iOS 应用数据',
  icon: Smartphone,
  category: 'forensic',
  order: 1,
  defaultVisible: true,
}
