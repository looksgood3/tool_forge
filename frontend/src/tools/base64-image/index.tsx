import { useEffect, useRef, useState } from 'react'
import { Copy, Download, ImageUp } from 'lucide-react'
import { ToolShell } from '@/components/tool/ToolShell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { meta } from './meta'
import {
  downloadDataUrl,
  fileToDataUrl,
  formatBytes,
  probeDataUrl,
  type ImageStats,
} from './logic'

export default function Base64Image() {
  const [dataUrl, setDataUrl] = useState('')
  const [stats, setStats] = useState<ImageStats | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!dataUrl) {
      setStats(null)
      setError('')
      return
    }
    probeDataUrl(dataUrl)
      .then((s) => {
        setStats(s)
        setError('')
      })
      .catch((e) => {
        setStats(null)
        setError(e instanceof Error ? e.message : '解析失败')
      })
  }, [dataUrl])

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件')
      return
    }
    try {
      const url = await fileToDataUrl(file)
      setDataUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败')
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (file) handleFile(file)
  }

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      onClear={() => {
        setDataUrl('')
        if (fileRef.current) fileRef.current.value = ''
      }}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <ImageUp className="h-3.5 w-3.5" />
            选择图片
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </>
      }
    >
      <div className="mx-auto grid h-full max-w-5xl grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onPaste={onPaste}
          tabIndex={0}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-sm transition-colors',
            dragging
              ? 'border-primary bg-accent'
              : 'border-border bg-card hover:border-foreground/30'
          )}
        >
          {dataUrl ? (
            <>
              <img
                src={dataUrl}
                alt="preview"
                className="max-h-[320px] max-w-full rounded border border-border object-contain"
              />
              {stats && (
                <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
                  <span>{stats.mime}</span>
                  <span>
                    {stats.width} × {stats.height}
                  </span>
                  <span>{formatBytes(stats.bytes)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-muted-foreground">
              <ImageUp className="mx-auto mb-2 h-8 w-8" />
              <div>拖拽 / 粘贴 / 选择图片</div>
              <div className="mt-1 text-xs">也可在右侧粘贴 Base64 直接预览</div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Base64 (Data URL)
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={!dataUrl}
                onClick={async () => {
                  await navigator.clipboard.writeText(dataUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1200)
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? '已复制' : '复制'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!dataUrl || !stats}
                onClick={() => downloadDataUrl(dataUrl)}
              >
                <Download className="h-3.5 w-3.5" />
                下载
              </Button>
            </div>
          </div>
          <textarea
            value={dataUrl}
            onChange={(e) => setDataUrl(e.target.value.trim())}
            placeholder="data:image/png;base64,iVBORw0KGgo..."
            spellCheck={false}
            className="flex-1 min-h-[240px] resize-none rounded-lg border border-border bg-card p-3 font-mono text-[11px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>
      </div>
    </ToolShell>
  )
}
