// 按 email 哈希生成稳定的彩色头像(HSL 色环上挑一个);用于账号列表/发件人头像。

const palette = [
  'from-blue-500/30 to-blue-600/20 text-blue-700 dark:text-blue-300',
  'from-purple-500/30 to-purple-600/20 text-purple-700 dark:text-purple-300',
  'from-pink-500/30 to-pink-600/20 text-pink-700 dark:text-pink-300',
  'from-emerald-500/30 to-emerald-600/20 text-emerald-700 dark:text-emerald-300',
  'from-amber-500/30 to-amber-600/20 text-amber-700 dark:text-amber-300',
  'from-rose-500/30 to-rose-600/20 text-rose-700 dark:text-rose-300',
  'from-cyan-500/30 to-cyan-600/20 text-cyan-700 dark:text-cyan-300',
  'from-violet-500/30 to-violet-600/20 text-violet-700 dark:text-violet-300',
  'from-teal-500/30 to-teal-600/20 text-teal-700 dark:text-teal-300',
  'from-orange-500/30 to-orange-600/20 text-orange-700 dark:text-orange-300',
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function avatarStyle(seed: string): string {
  const idx = hashStr(seed.toLowerCase()) % palette.length
  return `bg-gradient-to-br ${palette[idx]}`
}

export function avatarLetter(seed: string): string {
  const s = seed.trim()
  if (!s) return '?'
  // 邮箱:取 @ 前第一个字符
  const at = s.indexOf('@')
  const head = at >= 0 ? s.slice(0, at) : s
  return (head[0] || '?').toUpperCase()
}
