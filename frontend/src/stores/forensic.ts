import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ForensicStatus {
  checked: boolean
  found: boolean
  path: string
  version: string
  error: string
}

interface ForensicState {
  /** 用户自定义 go-forensic 路径。空 = 使用系统 PATH */
  binaryPath: string
  /** 默认 SSH 地址（iOS 用） */
  defaultSshAddr: string
  /** 默认输出根目录，前端仅用于 UI 默认值 */
  defaultOutputBase: string
  /** 缓存最近一次检测结果，避免每次进工具页都重新 exec */
  checkCache: {
    /** 缓存针对的路径；与当前 binaryPath 不一致时视为失效 */
    forPath: string
    found: boolean
    resolvedPath: string
    version: string
    error: string
    at: number
  } | null
  /** 最近使用的命令（最多 10 条） */
  history: HistoryItem[]
  setBinaryPath: (p: string) => void
  setDefaultSshAddr: (a: string) => void
  setDefaultOutputBase: (p: string) => void
  setCheckCache: (c: ForensicState['checkCache']) => void
  invalidateCheck: () => void
  pushHistory: (item: HistoryItem) => void
  clearHistory: () => void
}

export interface HistoryItem {
  at: number
  platform: 'android' | 'ios'
  args: string[]
  exitCode: number
  canceled?: boolean
}

export const useForensicStore = create<ForensicState>()(
  persist(
    (set) => ({
      binaryPath: '',
      defaultSshAddr: 'root@127.0.0.1:22',
      defaultOutputBase: '',
      checkCache: null,
      history: [],
      setBinaryPath: (p) =>
        set((s) => ({
          binaryPath: p,
          // 路径变了，旧缓存失效
          checkCache:
            s.checkCache && s.checkCache.forPath === p ? s.checkCache : null,
        })),
      setDefaultSshAddr: (a) => set({ defaultSshAddr: a }),
      setDefaultOutputBase: (p) => set({ defaultOutputBase: p }),
      setCheckCache: (c) => set({ checkCache: c }),
      invalidateCheck: () => set({ checkCache: null }),
      pushHistory: (item) =>
        set((s) => ({ history: [item, ...s.history].slice(0, 10) })),
      clearHistory: () => set({ history: [] }),
    }),
    { name: 'tool-forge:forensic' }
  )
)

/** 凭据库中 SSH 密码的 key 规则 */
export function sshPasswordKey(sshAddr: string): string {
  return `forensic:ssh:${sshAddr}`
}
