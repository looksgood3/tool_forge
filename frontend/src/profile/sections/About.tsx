import { useEffect, useState } from 'react'
import { ExternalLink, Hammer, Info, Mail } from 'lucide-react'
import { GetAppInfo } from '../../../wailsjs/go/main/App'
import type { main } from '../../../wailsjs/go/models'
import { toolRegistry } from '@/tools/registry'

const FEEDBACK_EMAIL = 'cherrytump@gmail.com'

export function AboutSection() {
  const [info, setInfo] = useState<main.AppInfo | null>(null)

  useEffect(() => {
    GetAppInfo().then(setInfo)
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
          <Hammer className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Tool Forge</h1>
          <p className="text-xs text-muted-foreground">
            v{info?.version ?? '…'} · 给程序员的一站式桌面工具箱
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <a
            href={`mailto:${FEEDBACK_EMAIL}?subject=Tool%20Forge%20反馈`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Mail className="h-3.5 w-3.5" />
            问题反馈
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          项目信息
        </div>
        <div className="divide-y divide-border">
          <Row label="已加载工具" value={`${toolRegistry.length} 个`} />
          <Row label="开源协议" value="MIT" />
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Tool Forge · Made with ♥
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  )
}
