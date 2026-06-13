// 文件哈希支持的算法(与后端 SupportedAlgos 一致),默认只勾 MD5
export const FILE_ALGOS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'CRC32'] as const
export type FileAlgo = (typeof FILE_ALGOS)[number]
export const DEFAULT_ALGOS: FileAlgo[] = ['MD5']

// hex 长度 → 唯一算法(用于校验模式自动判定;当前算法集无长度冲突)
export const HASH_LEN_TO_ALGO: Record<number, FileAlgo> = {
  8: 'CRC32',
  32: 'MD5',
  40: 'SHA-1',
  64: 'SHA-256',
  128: 'SHA-512',
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`
}

export function formatSpeed(bps: number): string {
  if (!bps || bps <= 0) return '—'
  return `${formatBytes(bps)}/s`
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

export function formatTime(ms: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

/** 归一化用户粘贴的哈希:去空白、转小写 */
export function normalizeHash(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}
