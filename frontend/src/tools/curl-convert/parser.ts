export interface CurlRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  basicAuth: { user: string; pass: string } | null
}

export function parseCurl(input: string): CurlRequest {
  const tokens = tokenize(stripLineContinuations(input).trim())
  if (tokens.length === 0 || !/^curl$/i.test(tokens[0])) {
    throw new Error('必须以 curl 开头')
  }

  const req: CurlRequest = {
    url: '',
    method: '',
    headers: {},
    body: null,
    basicAuth: null,
  }

  let i = 1
  while (i < tokens.length) {
    const t = tokens[i]
    const next = () => tokens[++i]
    switch (t) {
      case '-X':
      case '--request':
        req.method = next()
        break
      case '-H':
      case '--header': {
        const raw = next()
        const idx = raw.indexOf(':')
        if (idx > 0) {
          req.headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim()
        }
        break
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
        req.body = next()
        break
      case '--data-urlencode': {
        const val = next()
        req.body = req.body ? `${req.body}&${val}` : val
        break
      }
      case '-u':
      case '--user': {
        const raw = next()
        const colon = raw.indexOf(':')
        req.basicAuth = {
          user: colon >= 0 ? raw.slice(0, colon) : raw,
          pass: colon >= 0 ? raw.slice(colon + 1) : '',
        }
        break
      }
      case '-I':
      case '--head':
        req.method = 'HEAD'
        break
      case '-G':
      case '--get':
        req.method = 'GET'
        break
      // 忽略不影响代码生成的参数
      case '-k':
      case '--insecure':
      case '-L':
      case '--location':
      case '-s':
      case '--silent':
      case '-v':
      case '--verbose':
      case '-i':
      case '--include':
      case '--compressed':
        break
      default:
        if (t.startsWith('-')) {
          // 跳过未知参数及其可能的值
          const nextTok = tokens[i + 1]
          if (nextTok && !nextTok.startsWith('-') && !isUrl(nextTok)) i++
        } else if (!req.url && isUrl(t)) {
          req.url = t
        }
    }
    i++
  }

  if (!req.url) throw new Error('未找到 URL')
  if (!req.method) req.method = req.body ? 'POST' : 'GET'
  return req
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || s.startsWith('/')
}

function stripLineContinuations(s: string): string {
  return s.replace(/\\\r?\n/g, ' ')
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === "'" || ch === '"') {
      const quote = ch
      let value = ''
      i++
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          value += input[i + 1]
          i += 2
        } else {
          value += input[i++]
        }
      }
      i++ // skip closing quote
      tokens.push(value)
    } else {
      let value = ''
      while (i < input.length && !/\s/.test(input[i])) {
        if (input[i] === '\\' && i + 1 < input.length) {
          value += input[i + 1]
          i += 2
        } else {
          value += input[i++]
        }
      }
      tokens.push(value)
    }
  }
  return tokens
}
