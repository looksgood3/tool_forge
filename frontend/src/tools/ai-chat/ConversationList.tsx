import { useState } from 'react'
import { Plus, Trash2, Pencil, MessageSquare } from 'lucide-react'
import type { ConversationSummary } from './types'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/lib/utils'

interface Props {
  list: ConversationSummary[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

export function ConversationList({
  list,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: Props) {
  const dialog = useConfirm()
  const [editingId, setEditingId] = useState('')
  const [editValue, setEditValue] = useState('')

  const startEdit = (c: ConversationSummary) => {
    setEditingId(c.id)
    setEditValue(c.title)
  }

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    setEditingId('')
  }

  const askDelete = async (c: ConversationSummary) => {
    const ok = await dialog({
      title: '删除会话',
      message: `确认删除「${c.title}」?该会话所有消息都会丢失。`,
      danger: true,
      confirmLabel: '删除',
    })
    if (ok) onDelete(c.id)
  }

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-3">
        <Button onClick={onNew} size="sm" className="w-full">
          <Plus className="h-3.5 w-3.5" />
          新建对话
        </Button>
      </div>
      <ul className="flex-1 overflow-auto px-2 py-2">
        {list.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            还没有对话,点上方「新建」开始
          </li>
        ) : (
          list.map((c) => (
            <li
              key={c.id}
              onClick={() => editingId !== c.id && onSelect(c.id)}
              className={cn(
                'group/conv mb-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                activeId === c.id ? 'bg-info/15 text-info' : 'hover:bg-secondary',
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {editingId === c.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') setEditingId('')
                  }}
                  className="h-6 min-w-0 flex-1 rounded bg-background px-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate" title={c.title}>
                    {c.title}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      startEdit(c)
                    }}
                    title="重命名"
                    className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary group-hover/conv:flex"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void askDelete(c)
                    }}
                    title="删除"
                    className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover/conv:flex"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </aside>
  )
}
