import { useEffect, useState } from 'react'
import { Check, Copy, Play, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ReplayLLMProxyRequest } from '../../../wailsjs/go/main/App'
import type { llmproxy } from '../../../wailsjs/go/models'
import { buildCurl, extractDataImages, fmtBytes, fmtTime, foldBase64, methodClass, prettyJSON, statusClass } from './lib'

interface Props {
  detail: llmproxy.LogDetail
  proxyBase: string
  onClose: () => void
  onDelete: (id: number) => void
  onReplayed: (d: llmproxy.LogDetail) => void
}

type Tab = 'req' | 'resp' | 'raw'

export function LogDetail({ detail, proxyBase, onClose, onDelete, onReplayed }: Props) {
  const e = detail.entry
  const [tab, setTab] = useState<Tab>('resp')
  const [fold, setFold] = useState(true)
  const [copied, setCopied] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)

  useEffect(() => {
    setTab('resp')
    setReplayOpen(false)
  }, [detail.entry.id])

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(buildCurl(detail, proxyBase))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[680px] flex-col border-l border-border bg-card shadow-xl">
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className={cn('font-mono text-sm font-semibold', methodClass(e.method))}>{e.method}</span>
          <span className={cn('font-mono text-sm font-semibold', statusClass(e.status))}>{e.error ? '错误' : e.status}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={`${e.upstream}${e.path}`}>
            {e.upstream}
            {e.path}
          </span>
          <Button variant="ghost" size="sm" className="w-8 px-0" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 元信息 + 操作 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>{fmtTime(e.ts)}</span>
          <span>{e.durationMs}ms</span>
          <span>{fmtBytes(e.reqBytes)} → {fmtBytes(e.respBytes)}</span>
          {e.model && <span>model: {e.model}</span>}
          {e.totalTokens > 0 && <span>tokens: {e.promptTokens}+{e.completionTokens}={e.totalTokens}</span>}
          {e.stream && <span className="text-sky-600 dark:text-sky-400">SSE</span>}
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={copyCurl}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              curl
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReplayOpen((v) => !v)}>
              <Play className="h-3.5 w-3.5" /> 重放
            </Button>
            <Button variant="ghost" size="sm" className="w-8 px-0" onClick={() => onDelete(e.id)} title="删除此条">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {e.error && (
          <div className="border-b border-border bg-red-500/5 px-4 py-2 text-xs text-red-600 dark:text-red-400">
            {e.error}
          </div>
        )}

        {replayOpen && (
          <ReplayPanel detail={detail} onReplayed={(d) => { setReplayOpen(false); onReplayed(d) }} />
        )}

        {/* tab */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
          <TabBtn active={tab === 'req'} onClick={() => setTab('req')}>请求</TabBtn>
          <TabBtn active={tab === 'resp'} onClick={() => setTab('resp')}>响应{e.stream ? '(合并)' : ''}</TabBtn>
          {e.stream && <TabBtn active={tab === 'raw'} onClick={() => setTab('raw')}>原始 SSE</TabBtn>}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={fold} onChange={(ev) => setFold(ev.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            折叠 Base64
          </label>
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {tab === 'req' && (
            <Section
              headers={detail.reqHeaders}
              body={detail.reqBody}
              truncated={detail.reqTruncated}
              fold={fold}
            />
          )}
          {tab === 'resp' && (
            <Section
              headers={detail.respHeaders}
              body={detail.respBody}
              truncated={detail.respTruncated}
              fold={fold}
            />
          )}
          {tab === 'raw' && <BodyView text={detail.respRaw} fold={fold} truncated={detail.respTruncated} />}
        </div>
      </div>
    </>
  )
}

function Section({ headers, body, truncated, fold }: { headers: Record<string, string>; body: string; truncated: boolean; fold: boolean }) {
  const entries = Object.entries(headers || {})
  return (
    <div className="space-y-3">
      <details className="rounded-md border border-border" open={false}>
        <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium text-muted-foreground">
          Headers ({entries.length})
        </summary>
        <div className="space-y-0.5 border-t border-border/60 px-3 py-2 font-mono text-[11px]">
          {entries.map(([k, v]) => (
            <div key={k} className="break-all">
              <span className="text-muted-foreground">{k}:</span> {v}
            </div>
          ))}
        </div>
      </details>
      <BodyView text={body} fold={fold} truncated={truncated} />
    </div>
  )
}

function BodyView({ text, fold, truncated }: { text: string; fold: boolean; truncated: boolean }) {
  if (!text) return <div className="text-xs text-muted-foreground">(空)</div>
  const images = fold ? extractDataImages(text) : []
  const pretty = prettyJSON(text)
  const shown = fold ? foldBase64(pretty) : pretty
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((src, i) => (
            <img key={i} src={src} alt="" className="h-16 w-16 rounded border border-border object-cover" />
          ))}
        </div>
      )}
      {truncated && (
        <div className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400">
          内容超过上限,已截断(可在设置里调大单条 body 上限)
        </div>
      )}
      <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-secondary/20 p-3 font-mono text-[11px] leading-relaxed">
        {shown}
      </pre>
    </div>
  )
}

function ReplayPanel({ detail, onReplayed }: { detail: llmproxy.LogDetail; onReplayed: (d: llmproxy.LogDetail) => void }) {
  const e = detail.entry
  const [body, setBody] = useState(detail.reqBody)
  const [auth, setAuth] = useState('')
  const [extraHeaders, setExtraHeaders] = useState(() =>
    Object.entries(detail.reqHeaders || {})
      .filter(([k]) => !['authorization', 'host', 'content-length'].includes(k.toLowerCase()))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
  )
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  const send = async () => {
    setSending(true)
    setErr('')
    try {
      const headers: Record<string, string> = {}
      for (const line of extraHeaders.split('\n')) {
        const idx = line.indexOf(':')
        if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
      if (auth.trim()) headers['Authorization'] = auth.trim()
      const d = await ReplayLLMProxyRequest({
        upstream: e.upstream,
        method: e.method,
        path: e.path,
        headers,
        body,
      })
      if (d) onReplayed(d)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-2 border-b border-border bg-secondary/20 p-3">
      <div className="text-xs font-medium">重放(密钥未保存,需填 Authorization)</div>
      <input
        type="password"
        value={auth}
        onChange={(e) => setAuth(e.target.value)}
        placeholder="Authorization,如 Bearer sk-..."
        autoComplete="off"
        spellCheck={false}
        className="h-8 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-ring"
      />
      <textarea
        value={extraHeaders}
        onChange={(e) => setExtraHeaders(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="其它头,每行 key: value"
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-ring"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder="请求体"
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-ring"
      />
      {err && <div className="text-[11px] text-red-600 dark:text-red-400">{err}</div>}
      <div className="flex justify-end">
        <Button size="sm" onClick={send} disabled={sending}>
          <Send className="h-3.5 w-3.5" /> {sending ? '发送中…' : '发送'}
        </Button>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
      )}
    >
      {children}
    </button>
  )
}
