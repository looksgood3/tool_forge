import { ShieldCheck } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'net-env-check',
  path: '/tools/net-env-check',
  title: '网络环境体检',
  sidebarTitle: '网络体检',
  description: '出口 IP 风险 / 双路对比 / WebRTC·DNS 泄漏 / 时区语言一致性,综合评分与修复建议',
  icon: ShieldCheck,
  category: 'network',
  order: 32,
  defaultVisible: true,
}
