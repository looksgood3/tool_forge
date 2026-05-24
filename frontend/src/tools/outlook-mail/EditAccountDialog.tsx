import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { outlookAPI } from './api'
import type { AccountView, Group } from './types'

export function EditAccountDialog({
  account,
  groups,
  onClose,
  onSaved,
  onDeleted,
}: {
  account: AccountView
  groups: Group[]
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [email, setEmail] = useState(account.email)
  const [password, setPassword] = useState('')
  const [clientID, setClientID] = useState(account.client_id)
  const [refreshToken, setRefreshToken] = useState('')
  const [showRT, setShowRT] = useState(false)
  const [groupID, setGroupID] = useState(account.group_id)
  const [order, setOrder] = useState(account.order ?? 0)
  const [originalRT, setOriginalRT] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    void outlookAPI
      .getAccountSecret(account.id)
      .then((sec) => {
        setPassword(sec.password ?? '')
        setClientID(sec.client_id ?? '')
        setRefreshToken(sec.refresh_token ?? '')
        setOriginalRT(sec.refresh_token ?? '')
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [account.id])

  const save = async () => {
    setSaving(true)
    setErr('')
    try {
      await outlookAPI.updateAccount(account.id, {
        email: email !== account.email ? email : undefined,
        password,
        client_id: clientID,
        group_id: groupID !== account.group_id ? groupID : undefined,
        order,
      })
      // refresh_token 单独走 SetRefreshToken(只在改了时)
      if (refreshToken && refreshToken !== originalRT) {
        await outlookAPI.setRefreshToken(account.id, refreshToken)
      }
      onSaved()
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`删除账号「${account.email}」?`)) return
    try {
      await outlookAPI.deleteAccount(account.id)
      onDeleted()
      onClose()
    } catch (e) {
      setErr(String(e))
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[88vh] w-[480px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h3 className="text-sm font-semibold">编辑邮箱账号</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {loading ? (
          <div className="flex flex-1 items-center justify-center p-8 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 解密中...
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            <Field label="邮箱地址">
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-info"
              />
            </Field>
            <Field label="邮箱类型">
              <select
                value="outlook_oauth"
                disabled
                className="h-9 w-full rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground"
              >
                <option value="outlook_oauth">Outlook OAuth</option>
              </select>
            </Field>
            <Field label="密码">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="可选,只用于参考"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-info"
              />
            </Field>
            <Field label="Client ID">
              <input
                type="text"
                value={clientID}
                onChange={(e) => setClientID(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus:border-info"
              />
            </Field>
            <Field label="Refresh Token">
              <div className="relative">
                <textarea
                  rows={4}
                  value={showRT ? refreshToken : maskRT(refreshToken)}
                  onChange={(e) => {
                    if (showRT) setRefreshToken(e.target.value)
                  }}
                  readOnly={!showRT}
                  className={cn(
                    'w-full resize-none rounded-md border border-border bg-background p-2 pr-10 font-mono text-[11px] outline-none focus:border-info',
                    !showRT && 'cursor-not-allowed tracking-wide text-muted-foreground',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowRT((v) => !v)}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={showRT ? '隐藏' : '显示并编辑'}
                >
                  {showRT ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                默认隐藏;点击眼睛图标显示并可编辑。修改后会重新加密保存,未改则保持原值。
              </p>
            </Field>
            <Field label="所属分组">
              <select
                value={groupID}
                onChange={(e) => setGroupID(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-info"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="排序值">
              <input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value) || 0)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-info"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">数字越小越靠前。</p>
            </Field>

            {err && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {err}
              </div>
            )}
          </div>
        )}

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
          <button
            type="button"
            onClick={remove}
            className="h-8 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-xs text-destructive hover:bg-destructive/20"
          >
            删除
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-border bg-background px-3 text-xs hover:bg-accent"
            >
              取消
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="h-8 rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground/80">{label}</label>
      {children}
    </div>
  )
}

function maskRT(s: string): string {
  if (!s) return ''
  if (s.length <= 20) return '•'.repeat(s.length)
  return s.slice(0, 6) + '•'.repeat(Math.min(40, s.length - 12)) + s.slice(-6)
}
