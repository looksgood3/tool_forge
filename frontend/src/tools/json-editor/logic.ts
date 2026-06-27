export function formatJson(input: string, indent = 2): string {
  const parsed = JSON.parse(input)
  return JSON.stringify(parsed, null, indent)
}

export function minifyJson(input: string): string {
  const parsed = JSON.parse(input)
  return JSON.stringify(parsed)
}

// sortValue 递归把对象的 key 按字母序重排;数组顺序保持不变(数组有序,排了会改变语义)。
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortValue(obj[key])
    }
    return out
  }
  return value
}

// sortJsonKeys 解析后递归按 key 排序,再格式化输出(等价于 jq -S / json.dumps(sort_keys=True))。
export function sortJsonKeys(input: string, indent = 2): string {
  return JSON.stringify(sortValue(JSON.parse(input)), null, indent)
}

export function escapeJson(input: string): string {
  return JSON.stringify(input).slice(1, -1)
}

export function unescapeJson(input: string): string {
  // 与 escapeJson 互逆的主路径：内容里的 " 已经被转义为 \"，直接包引号解析
  try {
    return JSON.parse('"' + input + '"')
  } catch {
    // 兜底：用户手粘的内容里含有未转义的裸 "，只转义那些前面不是 \ 的
    try {
      return JSON.parse('"' + input.replace(/(^|[^\\])"/g, '$1\\"') + '"')
    } catch {
      throw new Error('无法反转义，请检查字符串格式')
    }
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
