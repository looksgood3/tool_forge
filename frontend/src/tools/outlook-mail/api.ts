// Wails RPC 薄封装。直接走 window.go.main.App,避免依赖 wailsjs 生成的具体类型。
// 函数签名与 backend/app.go 里的 RPC 一一对应。

import type {
  AccountPatch,
  AccountView,
  Config,
  ExtractResult,
  Folder,
  Group,
  ImportRequest,
  ImportResponse,
  MailDetail,
  MailPage,
  RefreshResult,
} from './types'

interface AppRPC {
  ListOutlookGroups(): Promise<Group[] | null>
  AddOutlookGroup(name: string, color: string): Promise<[Group | null, string]>
  RenameOutlookGroup(id: string, name: string): Promise<string>
  DeleteOutlookGroup(id: string): Promise<string>

  ListOutlookAccounts(groupID: string): Promise<AccountView[] | null>
  ImportOutlookAccounts(req: ImportRequest): Promise<ImportResponse>
  UpdateOutlookAccount(id: string, patch: AccountPatch): Promise<[AccountView | null, string]>
  DeleteOutlookAccount(id: string): Promise<string>

  RefreshOutlookToken(id: string): Promise<RefreshResult>
  RefreshOutlookTokens(ids: string[]): Promise<RefreshResult[] | null>

  ListOutlookMails(accountID: string, folder: string, page: number, pageSize: number): Promise<[MailPage | null, string]>
  GetOutlookMail(accountID: string, folder: string, messageID: string): Promise<[MailDetail | null, string]>
  ExtractOutlookMail(accountID: string, folder: string, messageID: string): Promise<[ExtractResult | null, string]>
  ExtractOutlookText(text: string): Promise<ExtractResult | null>

  GetOutlookConfig(): Promise<Config>
  UpdateOutlookConfig(cfg: Config): Promise<string>
}

function app(): AppRPC {
  const g = window as unknown as { go?: { main?: { App?: AppRPC } } }
  const a = g.go?.main?.App
  if (!a) throw new Error('Wails bridge 未就绪')
  return a
}

// 把 Go 双返回 (T, string) 规范成抛出 string 错误。
//
// 注意 Wails 对多返回值的序列化在不同 Wails 版本/不同场景下表现不一致,可能是:
//   1) 数组 [T, string]
//   2) 对象 { '0': T, '1': string }
//   3) 仅 T 本身(当 string 是空字符串时 Wails 可能省掉包装)
// 必须三种都兼容,所以不能用解构,也不能假定 r[0] 一定是 T。
async function unwrap<T>(p: Promise<[T | null, string]>): Promise<T> {
  const r = (await p) as any
  // Wails 对 (T, error) 的 error path 是 reject,只有 (T, string) 需要这套兼容。
  let v: T | null | undefined
  let err = ''
  if (r == null) {
    throw new Error('返回值为空')
  } else if (Array.isArray(r)) {
    v = r[0]
    err = (r[1] as string) ?? ''
  } else if (typeof r === 'object' && ('0' in r || '1' in r)) {
    v = (r as Record<string, unknown>)['0'] as T | null | undefined
    err = ((r as Record<string, unknown>)['1'] as string) ?? ''
  } else {
    // 直接是 T 本身(无错误时 Wails 偶尔会跳过包装)
    v = r as T
  }
  if (err) throw new Error(err)
  if (v == null) throw new Error('返回值为空')
  return v as T
}

// 同上,但 string 是单返回(后端直接 return string 表示错误,空字符串=ok)
async function unwrapErr(p: Promise<string>): Promise<void> {
  const err = await p
  if (err) throw new Error(err)
}

export const outlookAPI = {
  listGroups: () => app().ListOutlookGroups().then((g) => g ?? []),
  addGroup: (name: string, color = '') => unwrap(app().AddOutlookGroup(name, color)),
  renameGroup: (id: string, name: string) => unwrapErr(app().RenameOutlookGroup(id, name)),
  deleteGroup: (id: string) => unwrapErr(app().DeleteOutlookGroup(id)),

  listAccounts: (groupID = '') => app().ListOutlookAccounts(groupID).then((a) => a ?? []),
  importAccounts: (req: ImportRequest) => app().ImportOutlookAccounts(req),
  updateAccount: (id: string, patch: AccountPatch) => unwrap(app().UpdateOutlookAccount(id, patch)),
  deleteAccount: (id: string) => unwrapErr(app().DeleteOutlookAccount(id)),

  refreshOne: (id: string) => app().RefreshOutlookToken(id),
  refreshMany: (ids: string[]) => app().RefreshOutlookTokens(ids).then((r) => r ?? []),

  listMails: (accountID: string, folder: Folder, page: number, pageSize = 20) =>
    unwrap(app().ListOutlookMails(accountID, folder, page, pageSize)),
  getMail: (accountID: string, folder: Folder, messageID: string) =>
    unwrap(app().GetOutlookMail(accountID, folder, messageID)),
  extractMail: (accountID: string, folder: Folder, messageID: string) =>
    unwrap(app().ExtractOutlookMail(accountID, folder, messageID)),
  extractText: (text: string) => app().ExtractOutlookText(text),

  getConfig: () => app().GetOutlookConfig(),
  updateConfig: (cfg: Config) => unwrapErr(app().UpdateOutlookConfig(cfg)),
}
