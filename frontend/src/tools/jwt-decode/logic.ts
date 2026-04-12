export interface JwtDecoded {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  expiresAt?: Date
  issuedAt?: Date
  notBefore?: Date
  isExpired?: boolean
}

function base64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4)
  const binary = atob(padded + '='.repeat(padding))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

export function decodeJwt(token: string): JwtDecoded {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '')
  const parts = trimmed.split('.')
  if (parts.length !== 3) throw new Error('JWT 必须由三段点分隔的字符串组成')

  let header: Record<string, unknown>
  let payload: Record<string, unknown>
  try {
    header = JSON.parse(base64UrlDecode(parts[0]))
  } catch {
    throw new Error('Header 部分解码失败')
  }
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]))
  } catch {
    throw new Error('Payload 部分解码失败')
  }

  const result: JwtDecoded = { header, payload, signature: parts[2] }
  if (typeof payload.exp === 'number') {
    result.expiresAt = new Date(payload.exp * 1000)
    result.isExpired = result.expiresAt.getTime() < Date.now()
  }
  if (typeof payload.iat === 'number') {
    result.issuedAt = new Date(payload.iat * 1000)
  }
  if (typeof payload.nbf === 'number') {
    result.notBefore = new Date(payload.nbf * 1000)
  }
  return result
}
