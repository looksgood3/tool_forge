// 前端使用的 outlook 邮箱数据类型。
// 跟后端 backend/tools/outlookmail/types.go 一一对应,大部分可以从 wailsjs 生成的
// outlookmail.* 拿,但有些字段(如 time.Time)被生成成 any,这里复制一份手写更清楚。

export type AccountStatus = 'active' | 'token_expired' | 'banned' | 'unknown'
export type Folder = 'inbox' | 'junkemail' | 'deleteditems'

export interface AccountView {
  id: string
  email: string
  has_password: boolean
  client_id: string
  type: string
  group_id: string
  tags?: string[] | null
  remark?: string
  status: AccountStatus
  last_error?: string
  has_proxy: boolean
  proxy?: string
  last_refresh_at?: string
  last_used_at?: string
  created_at: string
  updated_at: string
}

export interface AccountPatch {
  group_id?: string
  tags?: string[]
  remark?: string
  proxy?: string
  status?: AccountStatus
}

export interface Group {
  id: string
  name: string
  color?: string
  order: number
  created_at: string
}

export interface Mail {
  id: string
  account_id: string
  subject: string
  from: string
  from_name: string
  received: string
  is_read: boolean
  has_attachment: boolean
  body_preview: string
  folder: Folder
}

export interface MailDetail extends Mail {
  body_html: string
  body_text: string
}

export interface MailPage {
  mails: Mail[]
  total: number
  next_page: number
  has_more: boolean
}

export interface RefreshResult {
  account_id: string
  email: string
  success: boolean
  status: AccountStatus
  reason?: string
  new_expires_in?: number
}

export interface ImportRequest {
  group_id: string
  tags?: string[]
  remark?: string
  status?: string
  raw: string
}

export interface ImportResult {
  line: number
  email: string
  success: boolean
  reason?: string
  account_id?: string
}

export interface ImportResponse {
  total: number
  success: number
  failed: number
  results: ImportResult[]
}

export interface ExtractResult {
  code?: string
  links?: string[]
  source?: string
}

export interface Config {
  global_proxy?: string
  schedule_enabled: boolean
  schedule_type?: string
  schedule_interval_sec?: number
  schedule_cron?: string
  account_refresh_gap_ms?: number
}
