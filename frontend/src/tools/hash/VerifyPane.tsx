import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileDigit, Loader2, X, XCircle } from 'lucide-react'
import {
  StartHashJob,
  CancelHashJob,
  InspectFile,
  PickHashFiles,
} from '../../../wailsjs/go/main/App'
import { EventsOn } from '../../../wailsjs/runtime/runtime'
import { cn } from '@/lib/utils'
import { DropZone } from './DropZone'
import {
  HASH_LEN_TO_ALGO,
  type FileAlgo,
  formatBytes,
  formatSpeed,
  normalizeHash,
} from './shared'
import {
  EV_DONE,
  EV_ERROR,
  EV_FILE_DONE,
  EV_PROGRESS,
  type FileInfo,
  type FileResult,
  type Progress,
} from './types'

type Status = 'idle' | 'badlen' | 'hashing' | 'done' | 'error'

export function VerifyPane() {
  const [expected, setExpected] = useState('')
  const [file, setFile] = useState<{ path: string; name: string; info?: FileInfo } | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [bytesDone, setBytesDone] = useState(0)
  const [bytesTotal, setBytesTotal] = useState(0)
  const [speedBps, setSpeedBps] = useState(0)
  const [computed, setComputed] = useState('')
  const [matchedAlgo, setMatchedAlgo] = useState<FileAlgo | null>(null)
  const [match, setMatch] = useState<boolean | null>(null)
  const [jobId, setJobId] = useState('')
  const [error, setError] = useState('')
  const jobRef = useRef('')
  jobRef.current = jobId

  const setFromPaths = (paths: string[]) => {
    const p = paths[0]
    if (!p) return
    setFile({ path: p, name: p.replace(/^.*[\\/]/, '') })
    InspectFile(p)
      .then((info) => setFile((f) => (f && f.path === p ? { ...f, info: info as FileInfo } : f)))
      .catch(() => {})
  }

  const onPick = async () => {
    try {
      const paths = (await PickHashFiles()) as string[]
      if (paths && paths.length) setFromPaths([paths[0]])
    } catch {
      // 取消
    }
  }

  // —— 自动校验:文件 + 合法长度的 hash 同时具备时触发(expected 变化防抖 500ms)
  useEffect(() => {
    if (!file) return
    const norm = normalizeHash(expected)
    if (!norm) {
      setStatus('idle')
      return
    }
    const algo = HASH_LEN_TO_ALGO[norm.length]
    if (!algo) {
      setStatus('badlen')
      return
    }
    const t = setTimeout(() => {
      void run(file.path, algo, norm)
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expected, file?.path])

  const run = async (path: string, algo: FileAlgo, norm: string) => {
    if (jobRef.current) await CancelHashJob(jobRef.current)
    setStatus('hashing')
    setComputed('')
    setMatch(null)
    setMatchedAlgo(algo)
    setError('')
    setBytesDone(0)
    try {
      const id = (await StartHashJob([path], [algo])) as string
      setJobId(id)
    } catch (e: any) {
      setStatus('error')
      setError(String(e?.message ?? e))
    }
  }

  useEffect(() => {
    if (!jobId) return
    const norm = normalizeHash(expected)
    const offProgress = EventsOn(EV_PROGRESS + jobId, (p: Progress) => {
      setBytesDone(p.bytesDone)
      setBytesTotal(p.bytesTotal)
      setSpeedBps(p.speedBps)
    })
    const offFileDone = EventsOn(EV_FILE_DONE + jobId, (res: FileResult) => {
      if (res.error) {
        setStatus('error')
        setError(res.error)
        return
      }
      const algo = matchedAlgo
      const got = algo ? (res.hashes[algo] ?? '') : ''
      setComputed(got)
      setMatch(got.toLowerCase() === norm)
      setStatus('done')
    })
    const offDone = EventsOn(EV_DONE + jobId, () => setJobId(''))
    const offErr = EventsOn(EV_ERROR + jobId, (err: string) => {
      setStatus('error')
      setError(err || '未知错误')
      setJobId('')
    })
    return () => {
      offProgress()
      offFileDone()
      offDone()
      offErr()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const clearFile = () => {
    setFile(null)
    setStatus('idle')
    setComputed('')
    setMatch(null)
  }

  const pct = bytesTotal > 0 ? Math.min(100, Math.round((bytesDone / bytesTotal) * 100)) : 0

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      {/* 期望哈希 */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          粘贴期望的哈希值（自动按长度识别算法）
        </div>
        <textarea
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          placeholder="例如 5d41402abc4b2a76b9719d911017c592"
          spellCheck={false}
          className="min-h-[60px] w-full resize-y bg-transparent p-3 font-mono text-[13px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {/* 文件 */}
      {!file ? (
        <DropZone onPaths={setFromPaths} onPick={onPick} hint="拖入要校验的文件，或点击选择" />
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <FileDigit className="h-4 w-4 shrink-0 text-info" />
          <span className="truncate text-sm font-medium" title={file.path}>
            {file.name}
          </span>
          {file.info && (
            <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.info.size)}</span>
          )}
          <button
            type="button"
            onClick={clearFile}
            className="ml-auto text-muted-foreground hover:text-destructive"
            title="移除"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 结果 */}
      {status === 'badlen' && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          无法识别该哈希长度（支持 CRC32 / MD5 / SHA-1 / SHA-256 / SHA-512）
        </div>
      )}
      {status === 'hashing' && (
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-info">
            <Loader2 className="h-4 w-4 animate-spin" />
            计算 {matchedAlgo} 中… {pct}% · {formatSpeed(speedBps)}
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-info transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {status === 'done' && match === true && (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-3 text-sm font-medium text-success">
          <CheckCircle2 className="h-5 w-5" />
          匹配 · {matchedAlgo}
        </div>
      )}
      {status === 'done' && match === false && (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <XCircle className="h-5 w-5" />
            不匹配 · {matchedAlgo}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="w-12 shrink-0 text-muted-foreground">期望</span>
              <code className="break-all font-mono">{normalizeHash(expected)}</code>
            </div>
            <div className="flex gap-2">
              <span className="w-12 shrink-0 text-muted-foreground">实际</span>
              <code className={cn('break-all font-mono')}>{computed}</code>
            </div>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
