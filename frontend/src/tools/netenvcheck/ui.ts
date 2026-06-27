// 评分/严重度 → 颜色映射(SVG 描边用 hex,文字/底色用 tailwind 类)。

export function gradeHex(score: number): string {
  if (score >= 85) return '#10b981' // emerald
  if (score >= 70) return '#0ea5e9' // sky
  if (score >= 50) return '#f59e0b' // amber
  return '#ef4444' // red
}

export function gradeTextClass(score: number): string {
  if (score >= 85) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 70) return 'text-sky-600 dark:text-sky-400'
  if (score >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

// severity: ok / warn / bad —— 用于双路对比、卡片状态。
export function severityBoxClass(severity: string): string {
  switch (severity) {
    case 'ok':
      return 'border-emerald-500/40 bg-emerald-500/5'
    case 'warn':
      return 'border-amber-500/40 bg-amber-500/5'
    case 'bad':
      return 'border-red-500/40 bg-red-500/5'
    default:
      return 'border-border bg-card'
  }
}

// 修复建议严重度 → 徽章配色
export function remedySeverityClass(severity: string): string {
  switch (severity) {
    case 'high':
      return 'bg-red-500/15 text-red-600 dark:text-red-400'
    case 'medium':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    default:
      return 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
  }
}

export function goodBadClass(good: boolean): string {
  return good
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400'
}
