import { useCallback, useEffect, useMemo, useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolShell } from '@/components/tool/ToolShell'
import { meta } from './meta'
import { outlookAPI } from './api'
import { GroupPanel } from './GroupPanel'
import { AccountPanel } from './AccountPanel'
import { ImportDialog } from './ImportDialog'
import { MailList } from './MailList'
import { MailDetail } from './MailDetail'
import { SettingsDialog } from './SettingsDialog'
import type { AccountView, Folder, Group, Mail } from './types'

export default function OutlookMailTool() {
  const [groups, setGroups] = useState<Group[]>([])
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [selectedGroupID, setSelectedGroupID] = useState<string>('')
  const [selectedAccountID, setSelectedAccountID] = useState<string>('')
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null)
  const [folder, setFolder] = useState<Folder>('inbox')
  const [selectedIDs, setSelectedIDs] = useState<Set<string>>(new Set())
  const [refreshingIDs, setRefreshingIDs] = useState<Set<string>>(new Set())
  const [showImport, setShowImport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [mailReloadToken, setMailReloadToken] = useState(0)

  const reloadGroups = useCallback(async () => {
    const gs = await outlookAPI.listGroups()
    setGroups(gs)
  }, [])

  const reloadAccounts = useCallback(async () => {
    const list = await outlookAPI.listAccounts('')
    setAccounts(list)
  }, [])

  useEffect(() => {
    void reloadGroups()
    void reloadAccounts()
  }, [reloadGroups, reloadAccounts])

  const filteredAccounts = useMemo(() => {
    if (!selectedGroupID) return accounts
    return accounts.filter((a) => a.group_id === selectedGroupID)
  }, [accounts, selectedGroupID])

  const countsByGroup = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of accounts) {
      map[a.group_id] = (map[a.group_id] ?? 0) + 1
    }
    return map
  }, [accounts])

  const selectedAccount = useMemo(
    () => filteredAccounts.find((a) => a.id === selectedAccountID) ?? null,
    [filteredAccounts, selectedAccountID],
  )

  // 当切换账号时,清空已选邮件
  useEffect(() => {
    setSelectedMail(null)
  }, [selectedAccountID, folder])

  const toggleSelect = (id: string) => {
    setSelectedIDs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const refreshAll = async () => {
    const ids = accounts.map((a) => a.id)
    await runRefresh(ids)
  }

  const refreshSelected = async () => {
    await runRefresh(Array.from(selectedIDs))
  }

  const runRefresh = async (ids: string[]) => {
    if (ids.length === 0) return
    setRefreshingIDs(new Set(ids))
    try {
      await outlookAPI.refreshMany(ids)
    } finally {
      setRefreshingIDs(new Set())
      await reloadAccounts()
    }
  }

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="h-3.5 w-3.5" />
            设置
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1">
        <GroupPanel
          groups={groups}
          selectedID={selectedGroupID}
          countsByGroup={countsByGroup}
          onSelect={setSelectedGroupID}
          onChanged={async () => {
            await reloadGroups()
            await reloadAccounts()
          }}
        />
        <AccountPanel
          accounts={filteredAccounts}
          selectedID={selectedAccountID}
          selectedIDs={selectedIDs}
          refreshingIDs={refreshingIDs}
          onSelect={(id) => {
            setSelectedAccountID(id)
            setMailReloadToken((n) => n + 1)
          }}
          onToggleSelect={toggleSelect}
          onClearSelection={() => setSelectedIDs(new Set())}
          onOpenImport={() => setShowImport(true)}
          onRefresh={refreshAll}
          onRefreshSelected={refreshSelected}
          onAfterDelete={reloadAccounts}
        />
        <MailList
          accountID={selectedAccountID}
          folder={folder}
          selectedMailID={selectedMail?.id ?? ''}
          onSelectMail={setSelectedMail}
          onChangeFolder={setFolder}
          reloadToken={mailReloadToken}
        />
        <MailDetail
          accountEmail={selectedAccount?.email ?? ''}
          accountID={selectedAccountID}
          folder={folder}
          mail={selectedMail}
        />
      </div>

      {showImport && (
        <ImportDialog
          groups={groups}
          defaultGroupID={selectedGroupID || 'default'}
          onClose={() => setShowImport(false)}
          onImported={() => {
            void reloadAccounts()
          }}
        />
      )}
      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} onSaved={() => undefined} />
      )}
    </ToolShell>
  )
}
