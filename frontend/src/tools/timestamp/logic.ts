export type Unit = 's' | 'ms'

export function timestampToDate(ts: string, unit: Unit): Date {
  const trimmed = ts.trim()
  if (!/^-?\d+$/.test(trimmed)) throw new Error('必须是整数')
  const num = Number(trimmed)
  if (!Number.isFinite(num)) throw new Error('超出范围')
  const ms = unit === 's' ? num * 1000 : num
  const date = new Date(ms)
  if (isNaN(date.getTime())) throw new Error('无效时间戳')
  return date
}

export function dateToTimestamp(input: string, unit: Unit): number {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('空输入')
  const date = new Date(trimmed.replace(/-/g, '/'))
  if (isNaN(date.getTime())) throw new Error('无法解析的日期')
  const ms = date.getTime()
  return unit === 's' ? Math.floor(ms / 1000) : ms
}

export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export function formatIsoUtc(date: Date): string {
  return date.toISOString()
}
