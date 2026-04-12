import { TerminalSquare } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'curl-convert',
  path: '/tools/curl-convert',
  title: 'cURL 转代码',
  description: 'cURL 命令转 JS / Python / Go / Java / PHP 等语言',
  icon: TerminalSquare,
  category: 'network',
  order: 10,
  defaultVisible: true,
}
