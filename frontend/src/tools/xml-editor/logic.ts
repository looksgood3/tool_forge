/**
 * 基于正则的 XML 格式化/压缩：轻量、够用于常见文档。
 * 不做 schema 校验，仅做结构化缩进。
 */
export function formatXml(input: string, indent = 2): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const tokens = tokenize(trimmed)
  const pad = ' '.repeat(indent)
  let level = 0
  const lines: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.kind === 'decl' || tok.kind === 'comment' || tok.kind === 'cdata') {
      lines.push(pad.repeat(level) + tok.value)
    } else if (tok.kind === 'close') {
      level = Math.max(0, level - 1)
      // 合并 <x>text</x> 这种情况
      const last = lines[lines.length - 1]
      const prev = tokens[i - 1]
      if (prev && prev.kind === 'text' && !prev.value.includes('\n')) {
        lines[lines.length - 1] = last + tok.value
      } else {
        lines.push(pad.repeat(level) + tok.value)
      }
    } else if (tok.kind === 'open') {
      lines.push(pad.repeat(level) + tok.value)
      level++
    } else if (tok.kind === 'self') {
      lines.push(pad.repeat(level) + tok.value)
    } else if (tok.kind === 'text') {
      const text = tok.value.trim()
      if (!text) continue
      const last = lines[lines.length - 1] ?? ''
      // 贴在上一行尾（作为同行文本）
      lines[lines.length - 1] = last + text
    }
  }
  return lines.join('\n')
}

export function minifyXml(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  // 去掉标签之间的空白（但保留标签内文本的空白）
  return trimmed.replace(/>\s+</g, '><').replace(/\s+\/>/g, '/>').trim()
}

type Token =
  | { kind: 'decl'; value: string }
  | { kind: 'comment'; value: string }
  | { kind: 'cdata'; value: string }
  | { kind: 'open'; value: string }
  | { kind: 'close'; value: string }
  | { kind: 'self'; value: string }
  | { kind: 'text'; value: string }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    if (input[i] === '<') {
      if (input.startsWith('<!--', i)) {
        const end = input.indexOf('-->', i) + 3
        tokens.push({ kind: 'comment', value: input.slice(i, end) })
        i = end
      } else if (input.startsWith('<![CDATA[', i)) {
        const end = input.indexOf(']]>', i) + 3
        tokens.push({ kind: 'cdata', value: input.slice(i, end) })
        i = end
      } else if (input.startsWith('<?', i)) {
        const end = input.indexOf('?>', i) + 2
        tokens.push({ kind: 'decl', value: input.slice(i, end) })
        i = end
      } else {
        const end = input.indexOf('>', i) + 1
        const value = input.slice(i, end)
        if (value.startsWith('</')) tokens.push({ kind: 'close', value })
        else if (value.endsWith('/>')) tokens.push({ kind: 'self', value })
        else tokens.push({ kind: 'open', value })
        i = end
      }
    } else {
      let end = input.indexOf('<', i)
      if (end === -1) end = input.length
      tokens.push({ kind: 'text', value: input.slice(i, end) })
      i = end
    }
  }
  return tokens
}

export function validateXml(input: string): { valid: boolean; error?: string } {
  if (!input.trim()) return { valid: false, error: '' }
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(input, 'application/xml')
    const err = doc.querySelector('parsererror')
    if (err) return { valid: false, error: err.textContent?.split('\n')[0] || '格式错误' }
    return { valid: true }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : '解析失败' }
  }
}
