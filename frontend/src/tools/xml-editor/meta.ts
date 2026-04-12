import { FileCode } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'xml-editor',
  path: '/tools/xml-editor',
  title: 'XML 编辑器',
  description: '格式化 / 压缩 XML，语法高亮',
  icon: FileCode,
  category: 'data',
  order: 20,
  defaultVisible: true,
}
