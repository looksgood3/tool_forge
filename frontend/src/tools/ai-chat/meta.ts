import { MessagesSquare } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'ai-chat',
  path: '/tools/ai-chat',
  title: 'AI 问答',
  description: '配置 OpenAI 兼容供应商,与 ChatGPT / 中转 / 自托管模型对话',
  icon: MessagesSquare,
  category: 'ai',
  order: 14,
  defaultVisible: true,
}
