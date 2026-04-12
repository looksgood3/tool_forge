import { Link2 } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'url-codec',
  path: '/tools/url-codec',
  title: 'URL 编解码',
  description: 'URL 组件编解码，处理中文与特殊字符',
  icon: Link2,
  category: 'codec',
  order: 20,
  defaultVisible: true,
}
