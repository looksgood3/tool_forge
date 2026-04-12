import { Hash } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'number-base',
  path: '/tools/number-base',
  title: '进制转换',
  description: '二进制 / 八进制 / 十进制 / 十六进制互转',
  icon: Hash,
  category: 'dev',
  order: 10,
  defaultVisible: true,
}
