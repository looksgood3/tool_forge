import { useMemo, useState } from 'react'
import { Copy, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { avatarLetter, avatarStyle } from './avatar'
import { outlookAPI } from './api'
import type { AccountStatus, AccountView } from './types'

const STATUS_BADGE: Record<AccountStatus, { label: string; cls: string }> = {
  active: { label: 'OK', cls: 'bg-success/15 text-success border-success/30' },
  token_expired: { label: 'Token 失效', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30' },
  banned: { label: '已封禁', cls: 'bg-destructive/15 text-destructive border-destructive/40' },
  unknown: { label: '未刷新', cls: 'bg-muted text-muted-foreground border-border' },
}

export function AccountPanel({
  accounts,
  selectedID,
  selectedIDs,
  refreshingIDs,
  onSelect,
  onToggleSelect,
  onClearSelection,
  onOpenImport,
  onRefresh,
  onRefreshSelected,
  onAfterDelete,
}: {
  accounts: AccountView[]
  selectedID: string
  selectedIDs: Set<string>
  refreshingIDs: Set<string>
  onSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onClearSelection: () => void
  onOpenImport: () => void
  onRefresh: () => void
  onRefreshSelected: () => void
  onAfterDelete: () => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    if (!query.trim()) return accounts
    const q = query.toLowerCase()
    return accounts.filter(
      (a) =>
        a.email.toLowerCase().includes(q) ||
        (a.remark ?? '').toLowerCase().includes(q) ||
        (a.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    )
  }, [accounts, query])

  const copySelectedEmails = async () => {
    const list = accounts.filter((a) => selectedIDs.has(a.id)).map((a) => a.email)
    if (list.length === 0) return
    await navigator.clipboard.writeText(list.join('\n'))
  }

  const deleteSelected = async () => {
    if (selectedIDs.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedIDs.size} 个账号?`)) return
    for (const id of selectedIDs) {
      try {
        await outlookAPI.deleteAccount(id)
      } catch (e) {
        console.error(e)
      }
    }
    onClearSelection()
    onAfterDelete()
  }

  const hasSelection = selectedIDs.size > 0

  return (
    <section className="flex w-72 shrink-0 flex-col border-r border-border">
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <button
          type="button"
          onClick={onOpenImport}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-accent"
        >
          <Plus className="h-3 w-3" />
          导入
        </button>
        <button
          type="button"
          onClick={hasSelection ? onRefreshSelected : onRefresh}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-accent"
          title={hasSelection ? '刷新选中' : '刷新全部'}
        >
          <RefreshCw className="h-3 w-3" />
          {hasSelection ? `刷新 (${selectedIDs.size})` : '刷新'}
        </button>
        {hasSelection && (
          <>
            <button
              type="button"
              onClick={copySelectedEmails}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-accent"
              title="复制选中邮箱地址"
            >
              <Copy className="h-3 w-3" />
              复制
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 text-xs text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-3 w-3" />
              删除
            </button>
          </>
        )}
      </header>
      <div className="border-b border-border px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索邮箱 / 备注 / 标签"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-info"
          />
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <li className="p-6 text-center text-xs text-muted-foreground">
            {accounts.length === 0 ? '还没有账号,点上方"导入"添加' : '没有匹配的账号'}
          </li>
        ) : (
          filtered.map((a) => (
            <AccountItem
              key={a.id}
              account={a}
              active={a.id === selectedID}
              checked={selectedIDs.has(a.id)}
              refreshing={refreshingIDs.has(a.id)}
              onClick={() => onSelect(a.id)}
              onToggleSelect={() => onToggleSelect(a.id)}
            />
          ))
        )}
      </ul>
    </section>
  )
}

function AccountItem({
  account,
  active,
  checked,
  refreshing,
  onClick,
  onToggleSelect,
}: {
  account: AccountView
  active: boolean
  checked: boolean
  refreshing: boolean
  onClick: () => void
  onToggleSelect: () => void
}) {
  const badge = STATUS_BADGE[account.status] ?? STATUS_BADGE.unknown
  return (
    <li
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-2 border-b border-border/40 px-2 py-2 transition-colors',
        active ? 'bg-info/10' : 'hover:bg-accent/40',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggleSelect}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-info"
      />
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium',
          avatarStyle(account.email),
        )}
      >
        {avatarLetter(account.email)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs font-medium">{account.email}</span>
          {refreshing && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-info" />}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className={cn('rounded-sm border px-1 py-px', badge.cls)}>{badge.label}</span>
          {account.remark && <span className="truncate">· {account.remark}</span>}
          {account.has_proxy && <span className="text-info">· 代理</span>}
        </div>
      </div>
    </li>
  )
}
