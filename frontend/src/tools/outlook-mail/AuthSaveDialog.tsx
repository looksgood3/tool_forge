import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, ExternalLink, Loader2, X } from 'lucide-react'
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime'
import { outlookAPI } from './api'
import type { ExchangeResult, Group } from './types'

export function AuthSaveDialog({
  groups,
  defaultGroupID,
  onClose,
  onSaved,
}: {
  groups: Group[]
  defaultGroupID: string
  onClose: () => void
  onSaved: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [groupID, setGroupID] = useState(defaultGroupID || 'default')
  const [authURL, setAuthURL] = useState('')
  const [clientID, setClientID] = useState('')
  const [redirectURI, setRedirectURI] = useState('')
  const [redirectedURL, setRedirectedURL] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<ExchangeResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void outlookAPI.buildAuthURL().then((r) => {
      setAuthURL(r.auth_url)
      setClientID(r.client_id)
      setRedirectURI(r.redirect_uri)
    })
  }, [])

  const copy = async () => {
    await navigator.clipboard.writeText(authURL)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const openInBrowser = () => {
    if (authURL) BrowserOpenURL(authURL)
  }

  const exchangePreview = async () => {
    setErr('')
    setPreviewing(true)
    try {
      const r = await outlookAPI.exchangeCode(redirectedURL, clientID, redirectURI)
      setPreview(r)
      if (!email && r.email) setEmail(r.email)
    } catch (e) {
      setErr(String(e))
    } finally {
      setPreviewing(false)
    }
  }

  const directSave = async () => {
    setErr('')
    setSaving(true)
    try {
      await outlookAPI.saveFromAuth({
        redirected_url: redirectedURL,
        client_id: clientID,
        redirect_uri: redirectURI,
        email: email || undefined,
        password: password || undefined,
        group_id: groupID,
      })
      onSaved()
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-[640px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <span className="text-amber-500">🔑</span>
            授权并保存 Outlook 账号
          </h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {/* 入库账号信息 */}
          <section className="rounded-lg border border-border bg-muted/20 p-3">
            <h4 className="mb-2 text-xs font-semibold">待入库账号</h4>
            <p className="mb-3 text-[11px] text-muted-foreground">
              换取并预览只需要粘贴授权后的回调 URL。邮箱、密码和目标分组仅在保存账号时使用,可稍后补充。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="邮箱账号(可选)">
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@outlook.com"
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
                />
              </Field>
              <Field label="密码(可选)">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入邮箱密码"
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="目标分组">
                <select
                  value={groupID}
                  onChange={(e) => setGroupID(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* 步骤1 */}
          <section>
            <h4 className="mb-2 text-xs font-semibold">步骤 1: 打开授权页面</h4>
            <div className="flex items-stretch gap-1.5">
              <input
                type="text"
                value={authURL}
                readOnly
                className="h-8 flex-1 truncate rounded-md border border-border bg-muted px-2 font-mono text-[10px] outline-none"
              />
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-accent"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? '已复制' : '复制'}
              </button>
              <button
                type="button"
                onClick={openInBrowser}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-2.5 text-xs font-medium text-background hover:opacity-90"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                打开
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              点"打开"按钮在系统浏览器中授权,或点"复制"后手动粘贴到浏览器。
            </p>
          </section>

          {/* 步骤2 */}
          <section>
            <h4 className="mb-2 text-xs font-semibold">步骤 2: 粘贴授权后的回调 URL</h4>
            <textarea
              rows={3}
              value={redirectedURL}
              onChange={(e) => setRedirectedURL(e.target.value)}
              placeholder="授权成功后,浏览器会跳转到一个空白页(localhost:8080)。请复制地址栏的完整 URL 并粘贴到这里"
              className="w-full resize-none rounded-md border border-border bg-background p-2 font-mono text-xs outline-none focus:border-info"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              URL 格式类似:<code className="rounded bg-muted px-1">http://localhost:8080/?code=xxxxx&state=...</code>
            </p>
          </section>

          {/* 预览结果 */}
          {preview && (
            <section className="rounded-lg border border-success/40 bg-success/5 p-3">
              <h4 className="mb-2 text-xs font-semibold text-success">✓ 授权成功</h4>
              <table className="w-full text-[11px]">
                <tbody>
                  <Row label="邮箱地址" value={preview.email || '(未拿到,请手动填写)'} />
                  <Row label="Client ID" value={preview.client_id} mono />
                  <Row label="有效期" value={`${preview.expires_in} 秒`} />
                  <Row label="授权范围" value={preview.scope} mono small />
                  <Row
                    label="Refresh Token"
                    value={preview.refresh_token.slice(0, 24) + '...'}
                    mono
                  />
                </tbody>
              </table>
            </section>
          )}

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {err}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border border-border bg-background px-3 text-xs hover:bg-accent"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={exchangePreview}
            disabled={previewing || !redirectedURL.trim()}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs hover:bg-accent disabled:opacity-50"
          >
            {previewing && <Loader2 className="h-3 w-3 animate-spin" />}
            换取并预览
          </button>
          <button
            type="button"
            onClick={directSave}
            disabled={saving || !redirectedURL.trim()}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            直接保存(自动换取)
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-foreground/80">{label}</label>
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string
  value: string
  mono?: boolean
  small?: boolean
}) {
  return (
    <tr className="border-b border-border/40 last:border-b-0">
      <td className="py-1 pr-3 align-top text-muted-foreground">{label}</td>
      <td
        className={`py-1 ${mono ? 'font-mono' : ''} ${small ? 'text-[10px]' : ''} break-all`}
      >
        {value}
      </td>
    </tr>
  )
}
