import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  FileDigit,
  Loader2,
  Play,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import {
  StartHashJob,
  CancelHashJob,
  InspectFile,
  PickHashFiles,
} from '../../../wailsjs/go/main/App'
import { EventsOn } from '../../../wailsjs/runtime/runtime'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/lib/utils'
import { DropZone } from './DropZone'
import {
  DEFAULT_ALGOS,
  FILE_ALGOS,
  type FileAlgo,
  formatBytes,
  formatDuration,
  formatSpeed,
  formatTime,
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

type RowStatus = 'queued' | 'hashing' | 'done' | 'error'

interface Row {
  id: string
  path: string
  name: string
  info?: FileInfo
  status: RowStatus
  bytesDone: number
  bytesTotal: number
  speedBps: number
  hashes: Record<string, string>
  durationMs: number
  error?: string
}

let rowSeq = 0
const nextId = () => `row-${Date.now()}-${rowSeq++}`

export function FileHashPane() {
  const dialog = useConfirm()
  const [algos, setAlgos] = useState<FileAlgo[]>(DEFAULT_ALGOS)
  const [rows, setRows] = useState<Row[]>([])
  const [jobId, setJobId] = useState('')
  const [running, setRunning] = useState(false)
  const rowsRef = useRef<Row[]>([])
  rowsRef.current = rows

  // —— 加文件(拖入/选择):去重 + 读取文件信息
  const addPaths = async (paths: string[]) => {
    const have = new Set(rowsRef.current.map((r) => r.path))
    const fresh = paths.filter((p) => p && !have.has(p))
    if (fresh.length === 0) return
    const newRows: Row[] = fresh.map((p) => ({
      id: nextId(),
      path: p,
      name: p.replace(/^.*[\\/]/, ''),
      status: 'queued',
      bytesDone: 0,
      bytesTotal: 0,
      speedBps: 0,
      hashes: {},
      durationMs: 0,
    }))
    setRows((prev) => [...prev, ...newRows])
    // 异步补齐文件信息(大小/类型/魔数头)
    for (const r of newRows) {
      InspectFile(r.path)
        .then((info) => {
          setRows((prev) =>
            prev.map((x) =>
              x.id === r.id ? { ...x, info: info as FileInfo, bytesTotal: (info as FileInfo).size } : x,
            ),
          )
        })
        .catch(() => {})
    }
  }

  const onPick = async () => {
    try {
      const paths = (await PickHashFiles()) as string[]
      if (paths && paths.length) await addPaths(paths)
    } catch {
      // 用户取消
    }
  }

  const toggleAlgo = (a: FileAlgo) => {
    setAlgos((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id))
  const clearAll = () => {
    setRows([])
  }

  // —— 开始计算
  const start = async () => {
    if (running || rows.length === 0) return
    if (algos.length === 0) {
      await dialog({ title: '未选择算法', message: '请至少勾选一个哈希算法', confirmLabel: '知道了' })
      return
    }
    // 重置每行状态(按当前顺序,index 与后端一致)
    setRows((prev) =>
      prev.map((r) => ({ ...r, status: 'queued', bytesDone: 0, speedBps: 0, hashes: {}, durationMs: 0, error: undefined })),
    )
    try {
      const id = (await StartHashJob(
        rows.map((r) => r.path),
        algos,
      )) as string
      if (!id) {
        await dialog({ title: '启动失败', message: '后端未返回任务 ID', confirmLabel: '知道了' })
        return
      }
      setJobId(id)
      setRunning(true)
    } catch (e: any) {
      await dialog({ title: '启动失败', message: String(e?.message ?? e), confirmLabel: '知道了' })
    }
  }

  const cancel = async () => {
    if (jobId) await CancelHashJob(jobId)
    setRunning(false)
  }

  // —— 事件订阅
  useEffect(() => {
    if (!jobId) return
    const offProgress = EventsOn(EV_PROGRESS + jobId, (p: Progress) => {
      setRows((prev) =>
        prev.map((r, i) =>
          i === p.index
            ? { ...r, status: 'hashing', bytesDone: p.bytesDone, bytesTotal: p.bytesTotal || r.bytesTotal, speedBps: p.speedBps }
            : r,
        ),
      )
    })
    const offFileDone = EventsOn(EV_FILE_DONE + jobId, (res: FileResult) => {
      setRows((prev) =>
        prev.map((r, i) =>
          i === res.index
            ? {
                ...r,
                status: res.error ? 'error' : 'done',
                hashes: res.hashes ?? {},
                bytesTotal: res.size || r.bytesTotal,
                bytesDone: res.size || r.bytesDone,
                durationMs: res.durationMs,
                error: res.error,
              }
            : r,
        ),
      )
    })
    const offDone = EventsOn(EV_DONE + jobId, () => {
      setRunning(false)
      setJobId('')
    })
    const offErr = EventsOn(EV_ERROR + jobId, async (err: string) => {
      setRunning(false)
      setJobId('')
      await dialog({ title: '计算失败', message: err || '未知错误', confirmLabel: '知道了' })
    })
    return () => {
      offProgress()
      offFileDone()
      offDone()
      offErr()
    }
  }, [jobId])

  const copyCSV = async () => {
    const header = ['文件', '大小(字节)', ...algos]
    const lines = [header.map(csvCell).join(',')]
    for (const r of rows) {
      lines.push(
        [csvCell(r.name), String(r.bytesTotal || r.info?.size || 0), ...algos.map((a) => csvCell(r.hashes[a] ?? ''))].join(','),
      )
    }
    await navigator.clipboard.writeText(lines.join('\r\n'))
  }

  const anyDone = rows.some((r) => Object.keys(r.hashes).length > 0)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3">
      {/* 算法选择 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">算法：</span>
        {FILE_ALGOS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => toggleAlgo(a)}
            disabled={running}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
              algos.includes(a)
                ? 'border-info bg-info/10 text-info'
                : 'border-border text-muted-foreground hover:bg-secondary',
            )}
          >
            {a}
          </button>
        ))}
      </div>

      <DropZone onPaths={addPaths} onPick={onPick} hint="拖入文件，或点击选择（可多选）" />

      {/* 操作条 */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{rows.length} 个文件</span>
          <div className="ml-auto flex items-center gap-1.5">
            {anyDone && (
              <Button size="sm" variant="ghost" onClick={copyCSV}>
                <Copy className="h-3.5 w-3.5" />
                复制 CSV
              </Button>
            )}
            {!running && (
              <Button size="sm" variant="ghost" onClick={clearAll}>
                <Trash2 className="h-3.5 w-3.5" />
                清空
              </Button>
            )}
            <Button
              size="sm"
              variant={running ? 'outline' : 'default'}
              onClick={() => (running ? void cancel() : void start())}
              className="min-w-[88px]"
            >
              {running ? (
                <>
                  <Square className="h-3 w-3" />
                  停止
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  计算
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 结果列表 */}
      <div className="space-y-2">
        {rows.map((r) => (
          <FileRow key={r.id} row={r} algos={algos} running={running} onRemove={() => removeRow(r.id)} />
        ))}
      </div>
    </div>
  )
}

function FileRow({
  row,
  algos,
  running,
  onRemove,
}: {
  row: Row
  algos: FileAlgo[]
  running: boolean
  onRemove: () => void
}) {
  const [showInfo, setShowInfo] = useState(false)
  const pct = row.bytesTotal > 0 ? Math.min(100, Math.round((row.bytesDone / row.bytesTotal) * 100)) : 0

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <FileDigit className="h-4 w-4 shrink-0 text-info" />
        <span className="truncate text-sm font-medium" title={row.path}>
          {row.name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatBytes(row.bytesTotal || row.info?.size || 0)}
        </span>
        {row.info?.category && (
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {row.info.category}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {row.status === 'hashing' && (
            <span className="flex items-center gap-1.5 text-xs text-info">
              <Loader2 className="h-3 w-3 animate-spin" />
              {pct}% · {formatSpeed(row.speedBps)}
            </span>
          )}
          {row.status === 'done' && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" />
              {formatDuration(row.durationMs)}
            </span>
          )}
          {row.status === 'error' && (
            <span className="text-xs text-destructive" title={row.error}>
              失败
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            title="文件信息"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showInfo && 'rotate-180')} />
          </button>
          {!running && (
            <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive" title="移除">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {row.status === 'hashing' && (
        <div className="px-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-info transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* 文件信息 */}
      {showInfo && row.info && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          <InfoItem k="路径" v={row.info.path} mono />
          <InfoItem k="修改时间" v={formatTime(row.info.modifiedAt)} />
          <InfoItem k="MIME" v={row.info.mimeType || '—'} />
          <InfoItem k="推断扩展" v={row.info.mimeExt || row.info.ext || '—'} />
          <InfoItem k="魔数头" v={row.info.magicHex || '—'} mono />
          <InfoItem k="类别" v={row.info.category || '—'} />
        </div>
      )}

      {/* 哈希结果 */}
      {Object.keys(row.hashes).length > 0 && (
        <div className="space-y-1 border-t border-border/60 px-3 py-2">
          {algos
            .filter((a) => row.hashes[a])
            .map((a) => (
              <HashLine key={a} algo={a} value={row.hashes[a]} />
            ))}
        </div>
      )}

      {row.error && row.status === 'error' && (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-destructive">{row.error}</div>
      )}
    </div>
  )
}

function HashLine({ algo, value }: { algo: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-start gap-2">
      <span className="w-14 shrink-0 pt-0.5 text-[11px] font-semibold text-muted-foreground">{algo}</span>
      <code className="flex-1 break-all font-mono text-xs leading-relaxed">{value}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title="复制"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function InfoItem({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <span className="shrink-0 text-muted-foreground/70">{k}</span>
      <span className={cn('min-w-0 truncate text-foreground/80', mono && 'font-mono')} title={v}>
        {v}
      </span>
    </div>
  )
}

function csvCell(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
