import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  Eye,
  File,
  FilePlus,
  Folder,
  Loader2,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CodeEditor, type EditorLanguage } from '@/components/tool/CodeEditor'
import { MarkdownPreview } from '@/components/tool/MarkdownPreview'
import {
  DeleteClaudeMemoryNote,
  ListClaudeMemoryNotes,
  ListClaudeMemoryProjects,
  ReadClaudeMemoryNote,
  WriteClaudeMemoryNote,
} from '../../../wailsjs/go/main/App'
import type { claudeinsight } from '../../../wailsjs/go/models'
import { formatDateTime, formatRelative } from './lib/format'
import { ConfirmDialog, PromptDialog } from './Skills'

type Project = claudeinsight.MemoryProject
type Note = claudeinsight.MemoryNote
type NoteContent = claudeinsight.MemoryNoteContent

interface Props {
  reloadToken: number
}

type View =
  | { kind: 'list' }
  | { kind: 'project'; project: string }
  | { kind: 'file'; project: string; path: string }

export function Memory({ reloadToken }: Props) {
  const [view, setView] = useState<View>({ kind: 'list' })

  if (view.kind === 'file') {
    return (
      <NoteEditor
        project={view.project}
        path={view.path}
        onBack={() => setView({ kind: 'project', project: view.project })}
      />
    )
  }
  if (view.kind === 'project') {
    return (
      <ProjectDetail
        project={view.project}
        reloadToken={reloadToken}
        onBack={() => setView({ kind: 'list' })}
        onOpenFile={(p) => setView({ kind: 'file', project: view.project, path: p })}
      />
    )
  }
  return (
    <ProjectList reloadToken={reloadToken} onOpen={(name) => setView({ kind: 'project', project: name })} />
  )
}

// ---------- 项目列表 ----------

function ProjectList({
  reloadToken,
  onOpen,
}: {
  reloadToken: number
  onOpen: (name: string) => void
}) {
  const [items, setItems] = useState<Project[] | null>(null)
  const [projectsDir, setProjectsDir] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ListClaudeMemoryProjects()
      .then((r) => {
        if (cancelled) return
        setItems(r.items ?? [])
        setProjectsDir(r.projects_dir)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  if (loading && !items) return <Loading text="正在扫描各项目的 memory ..." />
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <div className="max-w-md text-sm text-muted-foreground">{error}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="text-xs text-muted-foreground">
        Claude Code 在每个项目下维护的记忆笔记（
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono" title={projectsDir}>
          {projectsDir}
        </code>
        ）
      </div>

      {items && items.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card text-center">
          <Brain className="h-8 w-8 text-info" />
          <div className="space-y-1">
            <h2 className="text-sm font-medium">还没有记忆笔记</h2>
            <p className="max-w-md text-xs text-muted-foreground">
              当 Claude 在某个项目里写入记忆时，会出现在这里。
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {items?.map((p) => (
            <ProjectCard key={p.project} item={p} onOpen={() => onOpen(p.project)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ProjectCard({ item, onOpen }: { item: Project; onOpen: () => void }) {
  return (
    <li className="rounded-lg border border-border bg-card transition-colors hover:border-info/40 hover:bg-info/5">
      <button onClick={onOpen} className="flex w-full flex-col items-start gap-1.5 p-3 text-left">
        <div className="flex w-full items-center gap-2">
          <Brain className="h-3.5 w-3.5 shrink-0 text-info" />
          <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium" title={item.project}>
            {item.project}
          </span>
          {item.has_index && (
            <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">索引</span>
          )}
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {item.file_count} 条
          </span>
        </div>
        {item.updated_at && (
          <div className="text-[10px] text-muted-foreground/70">更新于 {formatRelative(item.updated_at)}</div>
        )}
      </button>
    </li>
  )
}

// ---------- 项目内笔记列表 ----------

function ProjectDetail({
  project,
  onBack,
  onOpenFile,
  reloadToken,
}: {
  project: string
  onBack: () => void
  onOpenFile: (path: string) => void
  reloadToken: number
}) {
  const [files, setFiles] = useState<Note[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [toDelete, setToDelete] = useState<string | null>(null)

  const load = () => setReloadNonce((n) => n + 1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ListClaudeMemoryNotes(project)
      .then((r) => {
        if (!cancelled) setFiles(r.files ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project, reloadToken, reloadNonce])

  const doCreate = async (rel: string) => {
    setShowCreate(false)
    try {
      setBusy(true)
      await WriteClaudeMemoryNote(project, rel, '')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    const path = toDelete
    setToDelete(null)
    if (!path) return
    try {
      setBusy(true)
      await DeleteClaudeMemoryNote(project, path)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !files) return <Loading text="正在读取..." />
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <div className="max-w-md text-sm text-muted-foreground">{error}</div>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <Brain className="h-3.5 w-3.5 shrink-0 text-info" />
          <span className="truncate font-mono text-muted-foreground" title={project}>
            {project}
          </span>
        </div>
        <Button variant="default" size="sm" onClick={() => setShowCreate(true)} disabled={busy}>
          <FilePlus className="h-3.5 w-3.5" />
          新建笔记
        </Button>
      </div>

      {files && files.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-card text-sm text-muted-foreground">
          这个项目下还没有笔记
        </div>
      ) : (
        <ul className="space-y-1.5">
          {files?.map((f) => (
            <NoteRow
              key={f.path}
              file={f}
              onOpen={() => !f.is_dir && onOpenFile(f.path)}
              onDelete={() => setToDelete(f.path)}
            />
          ))}
        </ul>
      )}

      <PromptDialog
        open={showCreate}
        title="新建笔记"
        label="相对路径"
        placeholder="例如 notes/decisions.md"
        confirmLabel="创建"
        onConfirm={doCreate}
        onCancel={() => setShowCreate(false)}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title="删除笔记"
        message={`将删除 ${toDelete}，此操作不可撤销。`}
        confirmLabel="删除"
        destructive
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}

function NoteRow({
  file,
  onOpen,
  onDelete,
}: {
  file: Note
  onOpen: () => void
  onDelete: () => void
}) {
  const isIndex = file.path.toLowerCase() === 'memory.md'
  return (
    <li className="group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-info/40 hover:bg-info/5">
      <button
        onClick={onOpen}
        disabled={file.is_dir}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        {file.is_dir ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-info" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</span>
        {isIndex && (
          <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">索引</span>
        )}
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatSize(file.size)}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(file.updated_at)}</span>
      </button>
      <button
        onClick={onDelete}
        title="删除"
        className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-600 group-hover:inline-flex"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

// ---------- 笔记编辑器 ----------

function NoteEditor({
  project,
  path,
  onBack,
}: {
  project: string
  path: string
  onBack: () => void
}) {
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [meta, setMeta] = useState<NoteContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ReadClaudeMemoryNote(project, path)
      .then((r) => {
        if (cancelled) return
        setContent(r.content)
        setOriginal(r.content)
        setMeta(r)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project, path])

  const dirty = content !== original

  const save = async () => {
    if (!dirty) return
    try {
      setSaving(true)
      await WriteClaudeMemoryNote(project, path, content)
      setOriginal(content)
      setToast('已保存')
      setTimeout(() => setToast(''), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const goBack = () => {
    if (dirty) {
      setConfirmLeave(true)
      return
    }
    onBack()
  }

  const language: EditorLanguage = useMemo(() => {
    const ext = path.toLowerCase().split('.').pop() ?? ''
    if (ext === 'md' || ext === 'markdown') return 'markdown'
    if (ext === 'json') return 'json'
    if (ext === 'yaml' || ext === 'yml') return 'yaml'
    if (ext === 'ini' || ext === 'toml') return 'ini'
    return 'plaintext'
  }, [path])

  const isMarkdown = language === 'markdown'
  const [preview, setPreview] = useState(false)
  useEffect(() => {
    setPreview(isMarkdown) // 记忆笔记多为 md,默认先看渲染
  }, [path, isMarkdown])

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={goBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <span className="shrink-0 font-mono text-muted-foreground">{project}</span>
          <span className="shrink-0 text-muted-foreground">/</span>
          <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
          {dirty && <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">●</span>}
        </div>
        {meta?.updated_at && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(meta.updated_at)}</span>
        )}
        {isMarkdown && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreview((v) => !v)}
            title={preview ? '切回编辑模式' : '预览渲染效果'}
          >
            {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {preview ? '编辑' : '预览'}
          </Button>
        )}
        <Button variant="default" size="sm" onClick={save} disabled={!dirty || saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? '保存中...' : toast || '保存'}
        </Button>
      </div>

      {loading ? (
        <Loading text="正在读取..." />
      ) : error ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <div className="max-w-md text-sm text-muted-foreground">{error}</div>
        </div>
      ) : isMarkdown && preview ? (
        <MarkdownPreview
          value={content}
          className="flex-1 min-h-0 overflow-auto rounded-md border border-border bg-card px-5 py-4"
        />
      ) : (
        <CodeEditor
          value={content}
          onChange={setContent}
          language={language}
          minHeight="100%"
          className="flex-1 overflow-hidden rounded-md border border-border"
        />
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="放弃修改？"
        message="当前笔记有未保存的改动。如果现在离开，改动将丢失。"
        confirmLabel="放弃并离开"
        cancelLabel="留在这里"
        destructive
        onConfirm={() => {
          setConfirmLeave(false)
          onBack()
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  )
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      {text}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
