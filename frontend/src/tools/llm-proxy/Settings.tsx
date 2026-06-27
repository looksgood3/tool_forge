import { useEffect, useState } from 'react'
import { Check, Copy, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { llmproxy } from '../../../wailsjs/go/models'

interface Props {
  config: llmproxy.Config
  proxyBase: string
  onSave: (cfg: llmproxy.Config) => void
  saving?: boolean
}

export function Settings({ config, proxyBase, onSave, saving }: Props) {
  const [port, setPort] = useState(String(config.port))
  const [retention, setRetention] = useState(String(config.retentionDays))
  const [maxBody, setMaxBody] = useState(String(config.maxBodyKB))
  const [upstreams, setUpstreams] = useState<llmproxy.Upstream[]>(config.upstreams ?? [])
  const [copied, setCopied] = useState('')

  useEffect(() => {
    setPort(String(config.port))
    setRetention(String(config.retentionDays))
    setMaxBody(String(config.maxBodyKB))
    setUpstreams(config.upstreams ?? [])
  }, [config])

  const setUp = (i: number, patch: Partial<llmproxy.Upstream>) =>
    setUpstreams((list) => list.map((u, idx) => (idx === i ? { ...u, ...patch } : u)))
  const addUp = () =>
    setUpstreams((list) => [...list, { name: '', target: '', timeoutSec: 120, outboundProxy: 'env', disabled: false }])
  const delUp = (i: number) => setUpstreams((list) => list.filter((_, idx) => idx !== i))

  const copyAddr = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url)
      window.setTimeout(() => setCopied(''), 1200)
    })
  }

  const save = () => {
    onSave({
      ...config,
      port: parseInt(port) || 8788,
      retentionDays: Math.max(0, parseInt(retention) || 0),
      maxBodyKB: Math.max(1, parseInt(maxBody) || 8192),
      upstreams: upstreams
        .map((u) => ({ ...u, name: u.name.trim(), target: u.target.trim() }))
        .filter((u) => u.name && u.target),
    } as llmproxy.Config)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="监听端口">
          <input value={port} onChange={(e) => setPort(e.target.value)} className={inputCls} inputMode="numeric" />
        </Field>
        <Field label="日志保留天数(0=永久)">
          <input value={retention} onChange={(e) => setRetention(e.target.value)} className={inputCls} inputMode="numeric" />
        </Field>
        <Field label="单条 body 上限(KB)">
          <input value={maxBody} onChange={(e) => setMaxBody(e.target.value)} className={inputCls} inputMode="numeric" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">上游(客户端 base_url 指向 → 实际转发到)</span>
          <Button variant="outline" size="sm" onClick={addUp}>
            <Plus className="h-3.5 w-3.5" /> 添加上游
          </Button>
        </div>

        <div className="space-y-2">
          {upstreams.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              还没有上游。点「添加上游」,例:名 <code className="font-mono">openai</code> → <code className="font-mono">https://api.openai.com</code>
            </div>
          )}

          {upstreams.map((u, i) => {
            const addr = u.name ? `${proxyBase}/${u.name}` : ''
            return (
              <div
                key={i}
                className={cn(
                  'rounded-lg border p-2.5 transition-colors',
                  u.disabled ? 'border-border bg-secondary/20 opacity-70' : 'border-border bg-card'
                )}
              >
                <div className="flex items-center gap-2">
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground" title="是否启用该上游">
                    <input
                      type="checkbox"
                      checked={!u.disabled}
                      onChange={(e) => setUp(i, { disabled: !e.target.checked })}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    启用
                  </label>
                  <input
                    value={u.name}
                    onChange={(e) => setUp(i, { name: e.target.value })}
                    placeholder="路由名"
                    className={`${inputCls} w-32`}
                    spellCheck={false}
                  />
                  <span className="text-muted-foreground">→</span>
                  <input
                    value={u.target}
                    onChange={(e) => setUp(i, { target: e.target.value })}
                    placeholder="https://api.openai.com"
                    className={`${inputCls} flex-1`}
                    spellCheck={false}
                  />
                  <Button variant="ghost" size="sm" className="w-8 shrink-0 px-0" onClick={() => delUp(i)} title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 pl-[3.25rem]">
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    超时
                    <input
                      value={String(u.timeoutSec)}
                      onChange={(e) => setUp(i, { timeoutSec: parseInt(e.target.value) || 0 })}
                      className={`${inputCls} w-14 text-center`}
                      inputMode="numeric"
                    />
                    秒
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    出站
                    <select
                      value={u.outboundProxy || 'env'}
                      onChange={(e) => setUp(i, { outboundProxy: e.target.value })}
                      className={`${inputCls} w-24`}
                    >
                      <option value="env">跟随环境</option>
                      <option value="direct">直连</option>
                    </select>
                  </label>
                  {addr && !u.disabled && (
                    <button
                      onClick={() => copyAddr(addr)}
                      title="复制接入地址"
                      className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 font-mono text-[11px] hover:bg-accent"
                    >
                      {copied === addr ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      {addr}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          客户端 base_url 填上面的「接入地址」(通常再加 <code className="font-mono">/v1</code>);需自定义 http/socks5 出站时,在运行机配 HTTP(S)_PROXY 并选「跟随环境」。
        </p>
      </div>

      <div className="flex justify-end border-t border-border pt-3">
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="h-3.5 w-3.5" /> 保存配置
        </Button>
      </div>
    </div>
  )
}

const inputCls =
  'h-8 rounded-md border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-ring'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
