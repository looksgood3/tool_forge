export type Base = 2 | 8 | 10 | 16

const PATTERNS: Record<Base, RegExp> = {
  2: /^-?[01]+$/,
  8: /^-?[0-7]+$/,
  10: /^-?\d+$/,
  16: /^-?[0-9a-fA-F]+$/,
}

export function parseNumber(input: string, base: Base): bigint {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('空输入')
  if (!PATTERNS[base].test(trimmed)) throw new Error(`非 ${base} 进制`)
  // BigInt only accepts base 10 directly; for others use parseInt + BigInt loop
  const neg = trimmed.startsWith('-')
  const body = neg ? trimmed.slice(1) : trimmed
  let value = 0n
  const b = BigInt(base)
  for (const ch of body.toLowerCase()) {
    const digit = BigInt(parseInt(ch, base))
    value = value * b + digit
  }
  return neg ? -value : value
}

export function formatNumber(value: bigint, base: Base): string {
  return value.toString(base)
}
