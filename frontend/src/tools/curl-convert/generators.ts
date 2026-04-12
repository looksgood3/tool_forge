import type { CurlRequest } from './parser'

export interface Target {
  id: string
  label: string
  language: string
  render: (req: CurlRequest) => string
}

function q(s: string): string {
  return JSON.stringify(s)
}

function headersWithAuth(req: CurlRequest): Record<string, string> {
  const h = { ...req.headers }
  if (req.basicAuth) {
    const token = btoa(`${req.basicAuth.user}:${req.basicAuth.pass}`)
    h['Authorization'] = `Basic ${token}`
  }
  return h
}

export const TARGETS: Target[] = [
  {
    id: 'js-fetch',
    label: 'JavaScript (fetch)',
    language: 'javascript',
    render(req) {
      const headers = headersWithAuth(req)
      const init: string[] = [`  method: ${q(req.method)}`]
      if (Object.keys(headers).length > 0) {
        init.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')}`)
      }
      if (req.body) init.push(`  body: ${q(req.body)}`)
      return `fetch(${q(req.url)}, {\n${init.join(',\n')},\n})\n  .then(r => r.json())\n  .then(data => console.log(data))`
    },
  },
  {
    id: 'python-requests',
    label: 'Python (requests)',
    language: 'python',
    render(req) {
      const headers = headersWithAuth(req)
      const lines = ['import requests', '']
      if (Object.keys(headers).length > 0) {
        lines.push(`headers = ${pyDict(headers)}`)
      }
      if (req.body) lines.push(`data = ${q(req.body)}`)
      const args = [q(req.url)]
      if (Object.keys(headers).length > 0) args.push('headers=headers')
      if (req.body) args.push('data=data')
      lines.push(
        `response = requests.${req.method.toLowerCase()}(${args.join(', ')})`,
        'print(response.text)'
      )
      return lines.join('\n')
    },
  },
  {
    id: 'go-net-http',
    label: 'Go (net/http)',
    language: 'go',
    render(req) {
      const headers = headersWithAuth(req)
      const lines = [
        'package main',
        '',
        'import (',
        '\t"fmt"',
        '\t"io"',
        '\t"net/http"',
      ]
      if (req.body) lines.push('\t"strings"')
      lines.push(')', '', 'func main() {')
      if (req.body) {
        lines.push(`\tbody := strings.NewReader(${goString(req.body)})`)
        lines.push(
          `\treq, _ := http.NewRequest(${goString(req.method)}, ${goString(req.url)}, body)`
        )
      } else {
        lines.push(
          `\treq, _ := http.NewRequest(${goString(req.method)}, ${goString(req.url)}, nil)`
        )
      }
      for (const [k, v] of Object.entries(headers)) {
        lines.push(`\treq.Header.Set(${goString(k)}, ${goString(v)})`)
      }
      lines.push(
        '\tresp, err := http.DefaultClient.Do(req)',
        '\tif err != nil { panic(err) }',
        '\tdefer resp.Body.Close()',
        '\tdata, _ := io.ReadAll(resp.Body)',
        '\tfmt.Println(string(data))',
        '}'
      )
      return lines.join('\n')
    },
  },
  {
    id: 'node-axios',
    label: 'Node.js (axios)',
    language: 'javascript',
    render(req) {
      const headers = headersWithAuth(req)
      const config: Record<string, unknown> = {
        method: req.method.toLowerCase(),
        url: req.url,
      }
      if (Object.keys(headers).length > 0) config.headers = headers
      if (req.body) config.data = req.body
      return `import axios from 'axios'\n\nconst response = await axios(${JSON.stringify(
        config,
        null,
        2
      )})\nconsole.log(response.data)`
    },
  },
  {
    id: 'php-curl',
    label: 'PHP (cURL)',
    language: 'php',
    render(req) {
      const headers = headersWithAuth(req)
      const lines = ['<?php', '', '$ch = curl_init();']
      lines.push(`curl_setopt($ch, CURLOPT_URL, ${q(req.url)});`)
      lines.push('curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);')
      lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${q(req.method)});`)
      if (Object.keys(headers).length > 0) {
        const arr = Object.entries(headers)
          .map(([k, v]) => `    ${q(`${k}: ${v}`)}`)
          .join(',\n')
        lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [\n${arr}\n]);`)
      }
      if (req.body) {
        lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${q(req.body)});`)
      }
      lines.push('', '$response = curl_exec($ch);', 'curl_close($ch);', 'echo $response;')
      return lines.join('\n')
    },
  },
]

function pyDict(obj: Record<string, string>): string {
  const entries = Object.entries(obj)
    .map(([k, v]) => `    ${q(k)}: ${q(v)}`)
    .join(',\n')
  return `{\n${entries},\n}`
}

function goString(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
}
