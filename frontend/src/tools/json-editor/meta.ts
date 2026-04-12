import { FileJson } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'json-editor',
  path: '/tools/json-editor',
  title: 'JSON 编辑器',
  description: '格式化 / 压缩 / 转义 / 校验 JSON，语法高亮',
  icon: FileJson,
  category: 'data',
  order: 5,
  defaultVisible: true,
}
