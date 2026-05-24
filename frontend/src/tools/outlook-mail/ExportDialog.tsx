import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { outlookAPI } from './api'
import type { ExportSummary } from './types'

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [summary, setSummary] = useState<ExportSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    void outlookAPI.previewExport().then((s) => {
      setSummary(s)
      // 默认全选有账号的分组
      const init = new Set<string>()
      for (const g of s) if (g.count > 0) init.add(g.group_id)
      setSelected(init)
    })
  }, [])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allChecked = summary.length > 0 && summary.every((g) => selected.has(g.group_id))
  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set())
    } else {
      setSelected(new Set(summary.map((g) => g.group_id)))
    }
  }

  const submit = async () => {
    setErr('')
    const ids = Array.from(selected)
    if (ids.length === 0) {
      setErr('请至少选择一个分组')
      return
    }
    setExporting(true)
    try {
      const res = await outlookAPI.exportAccounts(ids)
      if (res.total_count === 0) {
        setErr('选中的分组里没有账号可导出')
        return
      }
      const ts = new Date()
      const pad = (n: number) => n.toString().padStart(2, '0')
      const fname = `outlook-accounts-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.txt`
      const path = await outlookAPI.pickExportPath(fname)
      if (!path) return // 用户取消
      await outlookAPI.writeExportFile(path, res.content)
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally {
      setExporting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[80vh] w-[440px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h3 className="text-sm font-semibold">导出邮箱</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          <p className="text-xs text-foreground/80">选择要导出的分组</p>
          <div className="rounded-lg border border-border">
            {summary.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">还没有分组</div>
            ) : (
              summary.map((g) => (
                <label
                  key={g.group_id}
                  className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent/30"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(g.group_id)}
                    onChange={() => toggle(g.group_id)}
                    className="h-3.5 w-3.5 accent-info"
                  />
                  <span className="flex-1 truncate text-xs font-medium">{g.group_name}</span>
                  <span className="rounded-full bg-muted px-2 text-[10px] text-muted-foreground">
                    {g.count}
                  </span>
                </label>
              ))
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="h-3.5 w-3.5 accent-info"
            />
            全选
          </label>
          <p className="text-[10px] text-muted-foreground">
            导出格式:每个分组先列分组名,后跟该分组下的账号,
            每行
            <code className="mx-1 rounded bg-muted px-1">email----password----client_id----refresh_token</code>。
            可用于备份或迁移到其他工具。
          </p>
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
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={exporting || selected.size === 0}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {exporting && <Loader2 className="h-3 w-3 animate-spin" />}
            导出
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
