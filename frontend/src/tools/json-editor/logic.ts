export function formatJson(input: string, indent = 2): string {
  const parsed = JSON.parse(input)
  return JSON.stringify(parsed, null, indent)
}

export function minifyJson(input: string): string {
  const parsed = JSON.parse(input)
  return JSON.stringify(parsed)
}

export function escapeJson(input: string): string {
  return JSON.stringify(input).slice(1, -1)
}

export function unescapeJson(input: string): string {
  try {
    return JSON.parse('"' + input.replace(/"/g, '\\"') + '"')
  } catch {
    throw new Error('无法反转义，请检查字符串格式')
  }
}

export function validate(input: string): { valid: boolean; error?: string } {
  if (!input.trim()) return { valid: false, error: '' }
  try {
    JSON.parse(input)
    return { valid: true }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : '无效 JSON' }
  }
}
