import { Shield } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'hash',
  path: '/tools/hash',
  title: '文件哈希',
  description: '文件流式 · 批量 · 校验 · 文本 · MD5/SHA/CRC32',
  icon: Shield,
  category: 'crypto',
  order: 20,
  defaultVisible: true,
}
