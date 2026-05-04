import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { TestAIProviderModel } from '../../../../wailsjs/go/main/App'
import type { Provider, TestResult } from '@/tools/ai-chat/types'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/lib/utils'

export function TestModelDialog({
  provider,
  onClose,
}: {
  provider: Provider
  onClose: () => void
}) {
  const dialog = useConfirm()
  const [selected, setSelected] = useState<string>(
    provider.models[0] ?? '',
  )
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const onTest = async () => {
    if (!selected) {
      await dialog({ title: '提示', message: '请先选择一个模型', confirmLabel: '知道了' })
      return
    }
    setTesting(true)
    setResult(null)
    try {
      const r = (await TestAIProviderModel(provider.id, selected)) as unknown as TestResult
      setResult(r)
    } finally {
      setTesting(false)
    }
  }

  const noModels = provider.models.length === 0

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[440px] max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h3 className="text-sm font-semibold">检测 API 密钥</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          {noModels ? (
            <p className="rounded-md border border-dashed border-border bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
              当前供应商还没选择模型,请先点「管理」从 /v1/models 拉一份并选入
            </p>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                选择要检测的模型
              </label>
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value)
                  setResult(null)
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                {provider.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                会发一次最小的 chat completion(stream:true)请求,收到首个 chunk 即视为成功
              </p>
            </div>
          )}

          {result && (
            <div
              className={cn(
                'flex items-start gap-3 rounded-md border p-3 text-xs',
                result.ok
                  ? 'border-success/30 bg-success/5'
                  : 'border-destructive/30 bg-destructive/5',
              )}
            >
              {result.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className={cn('font-medium', result.ok ? 'text-success' : 'text-destructive')}>
                  {result.ok ? '检测成功' : '检测失败'}
                </div>
                <div className="text-muted-foreground">
                  {result.message ?? '(无消息)'}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {result.statusCode ? `HTTP ${result.statusCode} · ` : ''}
                  耗时 {result.durationMs} ms
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-border bg-secondary/30 px-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={onTest} disabled={testing || noModels} size="sm">
            {testing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                检测中...
              </>
            ) : (
              '开始检测'
            )}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
