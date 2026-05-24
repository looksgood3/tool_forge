import { Mail } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'outlook-mail',
  path: '/tools/outlook-mail',
  title: 'Outlook 邮箱管理',
  sidebarTitle: 'Outlook',
  description: '批量管理 Outlook OAuth 账号,Graph + IMAP 双链路读邮件,一键提取验证码',
  icon: Mail,
  category: 'account',
  order: 19,
  defaultVisible: true,
}
