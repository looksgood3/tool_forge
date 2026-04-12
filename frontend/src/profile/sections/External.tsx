import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, FolderOpen, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CheckForensic,
  PickExecutable,
  SetForensicBinaryPath,
} from '../../../wailsjs/go/main/App'
import { useForensicStore } from '@/stores/forensic'
import type { forensic } from '../../../wailsjs/go/models'

export function ExternalSection() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">外部工具</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          配置 Tool Forge 依赖的外部命令行工具。路径为空表示使用系统 PATH。
        </p>
      </header>

      <GoForensicCard />
    </div>
  )
}

function GoForensicCard() {
  const binaryPath = useForensicStore((s) => s.binaryPath)
  const setBinaryPath = useForensicStore((s) => s.setBinaryPath)
  const defaultSshAddr = useForensicStore((s) => s.defaultSshAddr)
  const setDefaultSshAddr = useForensicStore((s) => s.setDefaultSshAddr)
  const cache = useForensicStore((s) => s.checkCache)
  const setCheckCache = useForensicStore((s) => s.setCheckCache)

  const [info, setInfo] = useState<forensic.Info | null>(() =>
    cache && cache.forPath === binaryPath
      ? ({
          found: cache.found,
          path: cache.resolvedPath,
          version: cache.version,
          error: cache.error,
        } as forensic.Info)
      : null
  )
  const [checking, setChecking] = useState(false)
  const [localPath, setLocalPath] = useState(binaryPath)

  const doCheck = async (path: string) => {
    setChecking(true)
    try {
      const result = await CheckForensic(path)
      setInfo(result)
      setCheckCache({
        forPath: path,
        found: result.found,
        resolvedPath: result.path,
        version: result.version,
        error: result.error ?? '',
        at: Date.now(),
      })
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    setLocalPath(binaryPath)
    // 进入页面时若缓存命中则不重跑
    if (cache && cache.forPath === binaryPath) {
      setInfo({
        found: cache.found,
        path: cache.resolvedPath,
        version: cache.version,
        error: cache.error,
      } as forensic.Info)
      return
    }
    doCheck(binaryPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binaryPath])

  const save = async () => {
    const trimmed = localPath.trim()
    setBinaryPath(trimmed)
    await SetForensicBinaryPath(trimmed)
    await doCheck(trimmed)
  }

  const pick = async () => {
    const picked = await PickExecutable('选择 go-forensic.exe').catch(() => '')
    if (picked) {
      setLocalPath(picked)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold">go-forensic</h2>
        <span className="text-xs text-muted-foreground">手机应用数据提取 CLI</span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        用于移动取证工具。留空则要求 go-forensic 在系统 PATH 中可直接调用。
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">可执行路径</label>
          <div className="flex gap-2">
            <input
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="留空使用 PATH；或选择 go-forensic.exe"
              spellCheck={false}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <Button variant="outline" size="sm" onClick={pick}>
              <FolderOpen className="h-3.5 w-3.5" />
              浏览
            </Button>
            <Button size="sm" onClick={save} disabled={checking}>
              保存并检测
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs">
          {checking ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              正在检测…
            </span>
          ) : info?.found ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已就绪
              </div>
              <div className="text-muted-foreground">
                路径：<code className="font-mono">{info.path}</code>
              </div>
              {info.version && (
                <div className="text-muted-foreground">
                  版本：<code className="font-mono">{info.version}</code>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{info?.error || '未找到 go-forensic'}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5 border-t border-border pt-4">
          <label className="text-xs font-medium text-muted-foreground">
            默认 iOS SSH 地址
          </label>
          <input
            value={defaultSshAddr}
            onChange={(e) => setDefaultSshAddr(e.target.value)}
            placeholder="root@127.0.0.1:22"
            spellCheck={false}
            className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  )
}
