import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, X } from 'lucide-react'
import { outlookAPI } from './api'
import type { Group, ImportResponse } from './types'

export function ImportDialog({
  groups,
  defaultGroupID,
  onClose,
  onImported,
}: {
  groups: Group[]
  defaultGroupID: string
  onClose: () => void
  onImported: () => void
}) {
  const [groupID, setGroupID] = useState(defaultGroupID || 'default')
  const [tagsInput, setTagsInput] = useState('')
  const [remark, setRemark] = useState('')
  const [status, setStatus] = useState<'unknown' | 'active'>('unknown')
  const [raw, setRaw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)

  useEffect(() => {
    setGroupID(defaultGroupID || 'default')
  }, [defaultGroupID])

  const linesCount = useMemo(
    () => raw.split('\n').filter((l) => l.trim()).length,
    [raw],
  )

  const submit = async () => {
    if (!raw.trim()) return
    setSubmitting(true)
    try {
      const tags = tagsInput
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await outlookAPI.importAccounts({
        group_id: groupID,
        tags: tags.length ? tags : undefined,
        remark: remark || undefined,
        status,
        raw,
      })
      setResult(res)
      if (res.success > 0) onImported()
    } catch (e) {
      alert(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[85vh] w-[920px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h3 className="text-sm font-semibold">导入邮箱账号</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {result ? (
          <ResultView res={result} onClose={onClose} />
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[260px_260px_1fr] divide-x divide-border overflow-auto">
            {/* 左:分组 / 备注 / 状态 */}
            <div className="space-y-4 p-4">
              <Field label="选择分组">
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
              <Field label="备注">
                <textarea
                  rows={3}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="可选,将写入本次新增账号"
                  className="w-full resize-none rounded-md border border-border bg-background p-2 text-xs outline-none focus:border-info"
                />
              </Field>
              <Field label="状态">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'unknown' | 'active')}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
                >
                  <option value="unknown">未刷新</option>
                  <option value="active">直接置为可用</option>
                </select>
              </Field>
            </div>

            {/* 中:类型 / 标签 */}
            <div className="space-y-4 p-4">
              <Field label="邮箱类型">
                <select
                  value="outlook_oauth"
                  disabled
                  className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-muted-foreground"
                >
                  <option value="outlook_oauth">Outlook OAuth</option>
                </select>
              </Field>
              <Field label="标签">
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="多个用逗号或空格分隔"
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
                />
              </Field>
            </div>

            {/* 右:粘贴区 */}
            <div className="flex min-h-0 flex-col p-4">
              <Field label={`账号信息 ${linesCount > 0 ? `(${linesCount} 行)` : ''}`}>
                <textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={'邮箱----密码----client_id----refresh_token\n一行一个,支持批量粘贴'}
                  className="h-[280px] w-full resize-none rounded-md border border-border bg-background p-2 font-mono text-xs outline-none focus:border-info"
                />
              </Field>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Outlook 支持两种格式并自动识别:
                <code className="mx-1 rounded bg-muted px-1">邮箱----密码----client_id----refresh_token</code>
                或
                <code className="mx-1 rounded bg-muted px-1">邮箱----密码----refresh_token----client_id</code>
              </p>
            </div>
          </div>
        )}

        {!result && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-border bg-background px-3 text-xs hover:bg-accent"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !raw.trim()}
              className="h-8 rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? '导入中...' : '导入'}
            </button>
          </footer>
        )}
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

function ResultView({ res, onClose }: { res: ImportResponse; onClose: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-4 flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3">
        <Stat label="总数" value={res.total} />
        <Stat label="成功" value={res.success} cls="text-success" />
        <Stat label="失败" value={res.failed} cls="text-destructive" />
      </div>
      <table className="w-full text-xs">
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            <th className="py-1.5 pr-2 text-left font-medium">行号</th>
            <th className="py-1.5 pr-2 text-left font-medium">邮箱</th>
            <th className="py-1.5 pr-2 text-left font-medium">结果</th>
            <th className="py-1.5 pr-2 text-left font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {res.results.map((r, i) => (
            <tr key={i} className="border-b border-border/40">
              <td className="py-1.5 pr-2 font-mono">{r.line}</td>
              <td className="py-1.5 pr-2 font-mono">{r.email}</td>
              <td className="py-1.5 pr-2">
                {r.success ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Check className="h-3 w-3" /> 成功
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-3 w-3" /> 失败
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-2 text-muted-foreground">{r.reason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90"
        >
          关闭
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, cls = '' }: { label: string; value: number; cls?: string }) {
  return (
    <div className="flex-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  )
}
