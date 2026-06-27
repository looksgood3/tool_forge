import { useState } from 'react'
import { ChevronDown, KeyRound, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Preset = 'balanced' | 'strict' | 'lenient'

const PRESETS: { value: Preset; label: string; hint: string }[] = [
  { value: 'strict', label: '严格', hint: '放大扣分,要求最干净' },
  { value: 'balanced', label: '均衡', hint: '默认权重' },
  { value: 'lenient', label: '宽松', hint: '降低扣分' },
]

export const TOGGLEABLE_SOURCES: { id: string; label: string }[] = [
  { id: 'ipwho.is', label: 'ipwho.is · 归属' },
  { id: 'ifconfig.co', label: 'ifconfig.co · 归属备用' },
  { id: 'ipapi.is', label: 'ipapi.is · 风险' },
  { id: 'ipinfo.io', label: 'ipinfo.io · 需 token' },
]

export interface SettingsProps {
  preset: Preset
  setPreset: (p: Preset) => void
  forceDirect: boolean
  setForceDirect: (v: boolean) => void
  proxyURL: string
  setProxyURL: (v: string) => void
  ipinfoToken: string
  setIpinfoToken: (v: string) => void
  onTokenBlur: () => void
  sources: string[]
  setSources: (v: string[]) => void
  disabled?: boolean
}

export function SettingsBar(props: SettingsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const toggleSource = (id: string) => {
    props.setSources(
      props.sources.includes(id)
        ? props.sources.filter((s) => s !== id)
        : [...props.sources, id]
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Settings2 className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
          {PRESETS.map((p) => (
            <button
              key={p.value}
              title={p.hint}
              disabled={props.disabled}
              onClick={() => props.setPreset(p.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                props.preset === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={props.forceDirect}
            disabled={props.disabled}
            onChange={(e) => props.setForceDirect(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          后端强制直连(看真实出口)
        </label>

        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          高级选项
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} />
        </button>
      </div>

      {showAdvanced && (
        <div className="grid gap-2 rounded-lg border border-border bg-card/50 p-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] text-muted-foreground">
              后端探测代理(选填,http/socks5,留空走系统/TUN)
            </span>
            <input
              value={props.proxyURL}
              disabled={props.disabled}
              onChange={(e) => props.setProxyURL(e.target.value)}
              placeholder="socks5://127.0.0.1:7890"
              spellCheck={false}
              className="h-8 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-ring"
            />
          </label>
          <label className="space-y-1">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <KeyRound className="h-3 w-3" />
              IPinfo Token(选填高级源,存系统凭据库)
            </span>
            <input
              type="password"
              value={props.ipinfoToken}
              disabled={props.disabled}
              onChange={(e) => props.setIpinfoToken(e.target.value)}
              onBlur={props.onTokenBlur}
              placeholder="ipinfo.io 的 access token"
              spellCheck={false}
              autoComplete="off"
              className="h-8 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs outline-none focus:border-ring"
            />
          </label>
          <div className="space-y-1 sm:col-span-2">
            <span className="text-[11px] text-muted-foreground">
              数据源(ipify 出口 IP 必跑,以下可关)
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {TOGGLEABLE_SOURCES.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    checked={props.sources.includes(s.id)}
                    disabled={props.disabled}
                    onChange={() => toggleSource(s.id)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
