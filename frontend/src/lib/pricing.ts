import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 价目表:USD / 每百万 token。可在花费卡里编辑,持久化到本地。
// match 为小写子串,匹配 model id;命中多条时取 match 最长(最具体)的一条。
export interface PriceEntry {
  id: string
  match: string
  label: string
  input: number
  output: number
  cacheWrite: number // Claude 缓存写(5m);OpenAI/Codex 无此项,留 0
  cacheRead: number // 缓存读 / OpenAI cached input
  custom?: boolean // 用户自行添加的行(可删;重置默认时保留)
}

type NumField = 'input' | 'output' | 'cacheWrite' | 'cacheRead'
type TextField = 'label' | 'match'

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `custom-${crypto.randomUUID()}`
  } catch {
    // ignore
  }
  return `custom-${Math.random().toString(36).slice(2)}`
}

// 默认价(2026-06):Claude 取自 claude-api 参考(缓存写=1.25×input、缓存读=0.1×input);
// OpenAI 取自公开资料,各源有出入,以可编辑为准。
export const DEFAULT_PRICES: PriceEntry[] = [
  // —— Claude ——
  { id: 'claude-opus-4', match: 'opus-4', label: 'Claude Opus 4.x', input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  { id: 'claude-sonnet-4', match: 'sonnet-4', label: 'Claude Sonnet 4.x', input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  { id: 'claude-haiku-4', match: 'haiku-4', label: 'Claude Haiku 4.x', input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  { id: 'claude-3-5-sonnet', match: '3-5-sonnet', label: 'Claude 3.5 Sonnet', input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  { id: 'claude-3-5-haiku', match: '3-5-haiku', label: 'Claude 3.5 Haiku', input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  { id: 'claude-3-opus', match: '3-opus', label: 'Claude 3 Opus', input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  // —— OpenAI / Codex —— (cacheWrite 不用)
  { id: 'gpt-5-codex', match: 'gpt-5-codex', label: 'GPT-5-Codex', input: 1.25, output: 10, cacheWrite: 0, cacheRead: 0.125 },
  { id: 'gpt-5-mini', match: 'gpt-5-mini', label: 'GPT-5 mini', input: 0.25, output: 2, cacheWrite: 0, cacheRead: 0.025 },
  { id: 'gpt-5', match: 'gpt-5', label: 'GPT-5', input: 1.25, output: 10, cacheWrite: 0, cacheRead: 0.125 },
  { id: 'gpt-4.1', match: 'gpt-4.1', label: 'GPT-4.1', input: 2, output: 8, cacheWrite: 0, cacheRead: 0.5 },
  { id: 'gpt-4o', match: 'gpt-4o', label: 'GPT-4o', input: 2.5, output: 10, cacheWrite: 0, cacheRead: 1.25 },
  { id: 'o4-mini', match: 'o4-mini', label: 'o4-mini', input: 1.1, output: 4.4, cacheWrite: 0, cacheRead: 0.275 },
  { id: 'o3', match: 'o3', label: 'o3', input: 2, output: 8, cacheWrite: 0, cacheRead: 0.5 },
]

interface PricingState {
  prices: PriceEntry[]
  setField: (id: string, field: NumField, value: number) => void
  setText: (id: string, field: TextField, value: string) => void
  addEntry: () => void
  removeEntry: (id: string) => void
  reset: () => void
}

export const usePricingStore = create<PricingState>()(
  persist(
    (set) => ({
      prices: DEFAULT_PRICES,
      setField: (id, field, value) =>
        set((s) => ({
          prices: s.prices.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
        })),
      setText: (id, field, value) =>
        set((s) => ({
          prices: s.prices.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
        })),
      addEntry: () =>
        set((s) => ({
          prices: [
            ...s.prices,
            { id: randomId(), match: '', label: '自定义模型', input: 0, output: 0, cacheWrite: 0, cacheRead: 0, custom: true },
          ],
        })),
      removeEntry: (id) => set((s) => ({ prices: s.prices.filter((p) => p.id !== id) })),
      // 重置:内置行恢复默认,保留用户自定义行
      reset: () => set((s) => ({ prices: [...DEFAULT_PRICES, ...s.prices.filter((p) => p.custom)] })),
    }),
    {
      name: 'tool-forge:pricing',
      version: 1,
      // 升级合并:内置行用已保存的覆盖值、缺失的用默认补;自定义行原样保留
      merge: (persisted, current) => {
        const saved = (persisted as PricingState | undefined)?.prices ?? []
        const byId = new Map(saved.map((p) => [p.id, p]))
        const base = DEFAULT_PRICES.map((d) => byId.get(d.id) ?? d)
        const customs = saved.filter((p) => p.custom && !DEFAULT_PRICES.some((d) => d.id === p.id))
        return { ...current, prices: [...base, ...customs] }
      },
    },
  ),
)

/** 按 model id 找最匹配的价目(取 match 最长者);找不到返回 null */
export function priceForModel(model: string, prices: PriceEntry[]): PriceEntry | null {
  const m = (model || '').toLowerCase()
  let best: PriceEntry | null = null
  for (const p of prices) {
    const match = p.match.trim().toLowerCase()
    if (!match) continue // 空匹配(刚添加未填)跳过
    if (m.includes(match) && (!best || match.length > best.match.length)) {
      best = p
    }
  }
  return best
}

export interface ClaudeModelTokens {
  model: string
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
}

export interface CodexModelTokens {
  model: string
  input_tokens: number
  output_tokens: number
  cached_tokens: number
  reasoning_tokens: number
}

/** 单条 Claude 模型用量的估算花费(USD);无匹配价目返回 null */
export function claudeCost(m: ClaudeModelTokens, prices: PriceEntry[]): number | null {
  const p = priceForModel(m.model, prices)
  if (!p) return null
  return (
    (m.input_tokens * p.input +
      m.output_tokens * p.output +
      m.cache_creation_tokens * p.cacheWrite +
      m.cache_read_tokens * p.cacheRead) /
    1_000_000
  )
}

/** 单条 Codex 模型用量的估算花费(USD);reasoning 计入 output、cached 走缓存读 */
export function codexCost(m: CodexModelTokens, prices: PriceEntry[]): number | null {
  const p = priceForModel(m.model, prices)
  if (!p) return null
  return (
    (m.input_tokens * p.input +
      (m.output_tokens + m.reasoning_tokens) * p.output +
      m.cached_tokens * p.cacheRead) /
    1_000_000
  )
}

/** 美元金额格式化:小额多保留小数 */
export function formatUSD(n: number): string {
  if (n <= 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  if (n < 100) return `$${n.toFixed(2)}`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
