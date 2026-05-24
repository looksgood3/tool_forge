import { useState } from 'react'
import { Check, FolderPlus, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { outlookAPI } from './api'
import type { Group } from './types'

export function GroupPanel({
  groups,
  selectedID,
  countsByGroup,
  onSelect,
  onChanged,
}: {
  groups: Group[]
  selectedID: string
  countsByGroup: Record<string, number>
  onSelect: (id: string) => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const startEdit = (g: Group) => {
    setEditing(g.id)
    setEditValue(g.name)
  }
  const submitEdit = async () => {
    if (!editing) return
    if (editValue.trim()) {
      try {
        await outlookAPI.renameGroup(editing, editValue.trim())
        onChanged()
      } catch (e) {
        alert(String(e))
      }
    }
    setEditing(null)
  }
  const submitNew = async () => {
    const name = newName.trim()
    if (!name) {
      setAdding(false)
      return
    }
    try {
      await outlookAPI.addGroup(name)
      onChanged()
    } catch (e) {
      alert(String(e))
    }
    setNewName('')
    setAdding(false)
  }
  const remove = async (g: Group) => {
    if (g.id === 'default') return
    if (!confirm(`删除分组「${g.name}」?该分组下的账号会迁移到默认分组。`)) return
    try {
      await outlookAPI.deleteGroup(g.id)
      if (selectedID === g.id) onSelect('')
      onChanged()
    } catch (e) {
      alert(String(e))
    }
  }
  const totalCount = Object.values(countsByGroup).reduce((s, n) => s + n, 0)

  return (
    <aside className="flex w-44 shrink-0 flex-col border-r border-border bg-muted/20">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold text-muted-foreground">分组</span>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="新建分组"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        <GroupItem
          name="全部"
          count={totalCount}
          active={selectedID === ''}
          onClick={() => onSelect('')}
        />
        {groups.map((g) => (
          <div key={g.id} className="group/row">
            {editing === g.id ? (
              <div className="flex items-center gap-1 p-1">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitEdit()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={submitEdit}
                  className="rounded p-1 text-success hover:bg-accent"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded p-1 text-muted-foreground hover:bg-accent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <GroupItem
                name={g.name}
                count={countsByGroup[g.id] ?? 0}
                active={selectedID === g.id}
                onClick={() => onSelect(g.id)}
                onEdit={() => startEdit(g)}
                onDelete={g.id === 'default' ? undefined : () => remove(g)}
              />
            )}
          </div>
        ))}
        {adding && (
          <div className="flex items-center gap-1 p-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNew()
                if (e.key === 'Escape') {
                  setNewName('')
                  setAdding(false)
                }
              }}
              placeholder="新分组名"
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-info"
              autoFocus
            />
            <button
              type="button"
              onClick={submitNew}
              className="rounded p-1 text-success hover:bg-accent"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setNewName('')
                setAdding(false)
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

function GroupItem({
  name,
  count,
  active,
  onClick,
  onEdit,
  onDelete,
}: {
  name: string
  count: number
  active: boolean
  onClick: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="group/row relative">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-xs transition-colors',
          active
            ? 'bg-info/15 font-medium text-info'
            : 'text-foreground/80 hover:bg-accent hover:text-foreground',
        )}
      >
        <span className="truncate">{name}</span>
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 text-[10px]',
            active ? 'bg-info/20 text-info' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      </button>
      {(onEdit || onDelete) && (
        <div className="absolute right-1 top-1 hidden gap-0.5 group-hover/row:flex">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className="rounded bg-background/80 p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="重命名"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="rounded bg-background/80 p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              title="删除"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
