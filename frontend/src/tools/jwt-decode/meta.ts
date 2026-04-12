import { KeyRound } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'jwt-decode',
  path: '/tools/jwt-decode',
  title: 'JWT 解析',
  description: '解析 JWT 的 Header 与 Payload，检查过期时间',
  icon: KeyRound,
  category: 'crypto',
  order: 10,
  defaultVisible: true,
}
