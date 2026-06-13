import { useMemo, useState } from 'react'
import { Coins, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  usePricingStore,
  priceForModel,
  claudeCost,
  codexCost,
  formatUSD,
  type ClaudeModelTokens,
  type CodexModelTokens,
} from '@/lib/pricing'

/**
 * 估算花费卡:按模型用量 × 价目表算出累计估算花费(USD)。
 * 价目表内置默认值、可在卡内编辑(持久化)。Claude / Codex 的 token 字段不同,用 kind 区分。
 * models 只约束有 model 字段;其余 token 字段在计算时按 kind 转成对应类型。
 */
export function CostCard({ kind, models }: { kind: 'claude' | 'codex'; models: { model: string }[] }) {
  const prices = usePricingStore((s) => s.prices)
  const setField = usePricingStore((s) => s.setField)
  const setText = usePricingStore((s) => s.setText)
  const addEntry = usePricingStore((s) => s.addEntry)
  const removeEntry = usePricingStore((s) => s.removeEntry)
  const reset = usePricingStore((s) => s.reset)
  const [editing, setEditing] = useState(false)

  const rows = useMemo(() => {
    return (models ?? [])
      .map((m) => {
        const cost =
          kind === 'claude'
            ? claudeCost(m as unknown as ClaudeModelTokens, prices)
            : codexCost(m as unknown as CodexModelTokens, prices)
        return { model: String(m.model || ''), cost, matched: priceForModel(String(m.model || ''), prices) != null }
      })
      .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
  }, [models, prices, kind])

  const total = rows.reduce((s, r) => s + (r.cost ?? 0), 0)
  const anyUnmatched = rows.some((r) => !r.matched)

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-medium">
        <Coins className="h-4 w-4 text-info" />
        估算花费
        <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
          累计 · 估算
        </span>
        <span className="ml-auto font-mono text-base font-semibold">{formatUSD(total)}</span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          title="编辑价格"
          className={cn(
            'ml-1 flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            editing ? 'bg-info/15 text-info' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-3 text-xs text-muted-foreground">暂无用量数据</div>
      ) : (
        <div className="divide-y divide-border/50">
          {rows.map((r) => (
            <div key={r.model || '(unknown)'} className="flex items-center gap-2 px-4 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={r.model}>
                {r.model || '(未知模型)'}
              </span>
              {r.matched ? (
                <span className="shrink-0 font-mono">{formatUSD(r.cost ?? 0)}</span>
              ) : (
                <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                  未配置单价
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {anyUnmatched && !editing && (
        <div className="border-t border-border/50 px-4 py-1.5 text-[10px] text-muted-foreground">
          部分模型未匹配到单价(按 $0 计)。点右上角 ✎ 补充价格。
        </div>
      )}

      {editing && (
        <PriceEditor
          prices={prices}
          onChange={setField}
          onText={setText}
          onAdd={addEntry}
          onRemove={removeEntry}
          onReset={reset}
        />
      )}
    </div>
  )
}

function PriceEditor({
  prices,
  onChange,
  onText,
  onAdd,
  onRemove,
  onReset,
}: {
  prices: ReturnType<typeof usePricingStore.getState>['prices']
  onChange: ReturnType<typeof usePricingStore.getState>['setField']
  onText: ReturnType<typeof usePricingStore.getState>['setText']
  onAdd: () => void
  onRemove: (id: string) => void
  onReset: () => void
}) {
  return (
    <div className="border-t border-border bg-secondary/20 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 text-[11px] text-muted-foreground">
          单价:USD / 每百万 token(按 model id 子串匹配)。新模型可点「添加」自行补充。
        </span>
        <button
          type="button"
          onClick={onReset}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          重置默认
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="px-1 py-1 text-left font-normal">模型</th>
              <th className="px-1 py-1 text-left font-normal">匹配</th>
              <th className="px-1 py-1 text-right font-normal">输入</th>
              <th className="px-1 py-1 text-right font-normal">输出</th>
              <th className="px-1 py-1 text-right font-normal">缓存写</th>
              <th className="px-1 py-1 text-right font-normal">缓存读</th>
              <th className="w-6 px-1 py-1" />
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.id} className="border-t border-border/40">
                {p.custom ? (
                  <td className="px-1 py-0.5">
                    <input
                      value={p.label}
                      onChange={(e) => onText(p.id, 'label', e.target.value)}
                      className="w-24 rounded border border-border bg-background px-1 py-0.5 outline-none focus:border-info/60"
                    />
                  </td>
                ) : (
                  <td className="px-1 py-1 text-foreground/80">{p.label}</td>
                )}
                {p.custom ? (
                  <td className="px-1 py-0.5">
                    <input
                      value={p.match}
                      placeholder="如 gpt-6"
                      onChange={(e) => onText(p.id, 'match', e.target.value)}
                      className="w-20 rounded border border-border bg-background px-1 py-0.5 font-mono outline-none focus:border-info/60"
                    />
                  </td>
                ) : (
                  <td className="px-1 py-1 font-mono text-muted-foreground" title="按此子串匹配 model id">
                    {p.match}
                  </td>
                )}
                <NumCell value={p.input} onChange={(v) => onChange(p.id, 'input', v)} />
                <NumCell value={p.output} onChange={(v) => onChange(p.id, 'output', v)} />
                <NumCell value={p.cacheWrite} onChange={(v) => onChange(p.id, 'cacheWrite', v)} />
                <NumCell value={p.cacheRead} onChange={(v) => onChange(p.id, 'cacheRead', v)} />
                <td className="px-1 py-0.5 text-center">
                  {p.custom && (
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      title="删除"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-info/50 hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        添加模型
      </button>
    </div>
  )
}

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <td className="px-1 py-0.5 text-right">
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          onChange(Number.isFinite(v) && v >= 0 ? v : 0)
        }}
        className="w-16 rounded border border-border bg-background px-1 py-0.5 text-right font-mono tabular-nums outline-none focus:border-info/60"
      />
    </td>
  )
}
