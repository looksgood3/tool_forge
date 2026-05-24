import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { outlookAPI } from './api'
import type { Config } from './types'

export function SettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    void outlookAPI.getConfig().then(setCfg).catch((e) => setErr(String(e)))
  }, [])

  const save = async () => {
    if (!cfg) return
    setSaving(true)
    setErr('')
    try {
      await outlookAPI.updateConfig(cfg)
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
      <div className="flex max-h-[85vh] w-[520px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h3 className="text-sm font-semibold">Outlook 设置</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {cfg && (
          <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
            <Section title="全局代理" desc="所有账号默认使用此代理;在编辑账号时可单独覆盖。支持 http(s):// 和 socks5://">
              <input
                type="text"
                value={cfg.global_proxy ?? ''}
                onChange={(e) => setCfg({ ...cfg, global_proxy: e.target.value })}
                placeholder="socks5://127.0.0.1:7890 或 http://user:pass@host:port"
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
              />
            </Section>

            <Section title="定时刷新 Token" desc="后台 worker 按指定间隔批量刷一遍所有账号的 refresh_token。建议至少 1 小时一次,避免触发频控。">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={cfg.schedule_enabled}
                  onChange={(e) => setCfg({ ...cfg, schedule_enabled: e.target.checked })}
                  className="h-3.5 w-3.5 accent-info"
                />
                启用定时刷新
              </label>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground">刷新周期 (秒)</label>
                  <input
                    type="number"
                    min={60}
                    value={cfg.schedule_interval_sec ?? 3600}
                    onChange={(e) =>
                      setCfg({ ...cfg, schedule_interval_sec: Number(e.target.value) || 0 })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
                    disabled={!cfg.schedule_enabled}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">默认 3600 秒(1 小时),最小 60 秒</p>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground">账号间间隔 (毫秒)</label>
                  <input
                    type="number"
                    min={0}
                    value={cfg.account_refresh_gap_ms ?? 500}
                    onChange={(e) =>
                      setCfg({ ...cfg, account_refresh_gap_ms: Number(e.target.value) || 0 })
                    }
                    className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">同一轮内每个账号间等待时间,防频控</p>
                </div>
              </div>
            </Section>

            {err && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {err}
              </div>
            )}
          </div>
        )}
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
            onClick={save}
            disabled={saving || !cfg}
            className="h-8 rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold">{title}</h4>
      {desc && <p className="mb-2 mt-1 text-[11px] text-muted-foreground">{desc}</p>}
      <div className="mt-2">{children}</div>
    </section>
  )
}
