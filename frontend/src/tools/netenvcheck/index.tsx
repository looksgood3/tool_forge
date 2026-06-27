import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, ShieldCheck } from 'lucide-react'
import { ToolShell } from '@/components/tool/ToolShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ExportNetEnvReport,
  GetPassword,
  RunNetEnvCheck,
  SavePassword,
} from '../../../wailsjs/go/main/App'
import { netenvcheck } from '../../../wailsjs/go/models'
import { meta } from './meta'
import { collectBrowserProbe } from './browserProbe'
import { ScoreGauge } from './components/ScoreGauge'
import { SettingsBar, TOGGLEABLE_SOURCES, type Preset } from './components/Settings'
import { EnvOverview } from './components/EnvOverview'
import {
  ConsistencyCard,
  DnsCard,
  DualPathCard,
  IpOverviewCard,
  RiskCard,
  SourcesBar,
  WebRTCCard,
} from './components/Cards'
import { DeductionList, RemediationPanel } from './components/Remediation'

const TOKEN_KEY = 'netenvcheck.ipinfo_token'
const PREFS_KEY = 'tool-forge:netenvcheck:prefs'

interface Prefs {
  preset: Preset
  forceDirect: boolean
  proxyURL: string
  sources: string[]
}

const ALL_SOURCES = TOGGLEABLE_SOURCES.map((s) => s.id)

function defaultPrefs(): Prefs {
  return { preset: 'balanced', forceDirect: false, proxyURL: '', sources: ALL_SOURCES }
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return { ...defaultPrefs(), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaultPrefs()
}

export default function NetEnvCheck() {
  const init = useRef(loadPrefs()).current
  const [preset, setPreset] = useState<Preset>(init.preset)
  const [forceDirect, setForceDirect] = useState(init.forceDirect)
  const [proxyURL, setProxyURL] = useState(init.proxyURL)
  const [sources, setSources] = useState<string[]>(init.sources)
  const [ipinfoToken, setIpinfoToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [report, setReport] = useState<netenvcheck.Report | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  // 启动时从系统凭据库读 IPinfo token
  useEffect(() => {
    GetPassword(TOKEN_KEY)
      .then((v) => setIpinfoToken(v || ''))
      .catch(() => {})
  }, [])

  // 持久化非敏感偏好
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ preset, forceDirect, proxyURL, sources }))
    } catch {
      /* ignore */
    }
  }, [preset, forceDirect, proxyURL, sources])

  const saveToken = () => {
    SavePassword(TOKEN_KEY, ipinfoToken.trim()).catch(() => {})
  }

  const run = async () => {
    setLoading(true)
    setError('')
    setExportOpen(false)
    try {
      setStage('正在采集浏览器信号(WebRTC / 出口 / 时区)…')
      const browser = await collectBrowserProbe()
      setStage('正在探测出口 IP、归属与风险…')
      const input = netenvcheck.Input.createFrom({
        preset,
        forceDirect,
        proxyURL: proxyURL.trim(),
        ipinfoToken: ipinfoToken.trim(),
        sources,
        browser,
      })
      const rep = await RunNetEnvCheck(input)
      setReport(rep)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setStage('')
    }
  }

  const doExport = async (format: 'md' | 'json' | 'html') => {
    setExportOpen(false)
    if (!report) return
    try {
      await ExportNetEnvReport(report, format)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      actions={
        report && (
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setExportOpen((v) => !v)}>
              <Download className="h-3.5 w-3.5" />
              导出
            </Button>
            {exportOpen && (
              <div className="absolute right-0 z-10 mt-1 w-28 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                {(['md', 'json', 'html'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => doExport(f)}
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }
    >
      <div className="mx-auto max-w-5xl space-y-4">
        <SettingsBar
          preset={preset}
          setPreset={setPreset}
          forceDirect={forceDirect}
          setForceDirect={setForceDirect}
          proxyURL={proxyURL}
          setProxyURL={setProxyURL}
          ipinfoToken={ipinfoToken}
          setIpinfoToken={setIpinfoToken}
          onTokenBlur={saveToken}
          sources={sources}
          setSources={setSources}
          disabled={loading}
        />

        <Button onClick={run} disabled={loading} className="w-full font-semibold" size="lg">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {loading ? stage || '体检中…' : '开始体检'}
        </Button>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {!report && !loading && !error && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            点击「开始体检」,检测当前出口 IP 风险、原生与浏览器出口是否一致、WebRTC/DNS 泄漏及时区语言一致性。
            <br />
            所有探测仅用于评估你自己的网络环境,不会改动任何网络设置。
          </div>
        )}

        {report && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
              <ScoreGauge score={report.score} grade={report.grade} />
              <div className="min-w-0 flex-1 space-y-1.5 text-center sm:text-left">
                <div className="text-sm text-muted-foreground">
                  {report.dualPath.conclusion}
                </div>
                <SourcesBar sources={report.sources} />
              </div>
            </div>

            <EnvOverview report={report} />

            <div className="grid gap-3 md:grid-cols-2">
              <IpOverviewCard report={report} />
              <DualPathCard dual={report.dualPath} />
              <RiskCard risk={report.backend.risk} />
              <WebRTCCard webrtc={report.webrtc} />
              <DnsCard dns={report.dns} />
              <ConsistencyCard c={report.consistency} />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">扣分明细</div>
              <DeductionList items={report.deductions} />
            </div>

            <RemediationPanel items={report.remediation} />
          </div>
        )}
      </div>
    </ToolShell>
  )
}
