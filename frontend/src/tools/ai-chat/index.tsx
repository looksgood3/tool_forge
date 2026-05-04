import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessagesSquare, Settings as SettingsIcon } from 'lucide-react'
import {
  ListAIProviders,
  ListAIConversations,
  CreateAIConversation,
  DeleteAIConversation,
  RenameAIConversation,
  GetAIConfig,
} from '../../../wailsjs/go/main/App'
import type {
  AIConfig,
  ConversationSummary,
  Provider,
} from './types'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { ConversationList } from './ConversationList'
import { ChatPane } from './ChatPane'

export default function AIChat() {
  const navigate = useNavigate()
  const dialog = useConfirm()
  const [providers, setProviders] = useState<Provider[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState('')
  const [defaults, setDefaults] = useState<AIConfig>({
    defaultProviderId: '',
    defaultModelId: '',
  })

  const reloadAll = async () => {
    const [provList, convList, cfg] = await Promise.all([
      ListAIProviders(),
      ListAIConversations(),
      GetAIConfig(),
    ])
    setProviders(((provList ?? []) as unknown) as Provider[])
    setConversations(((convList ?? []) as unknown) as ConversationSummary[])
    setDefaults(cfg as unknown as AIConfig)
  }

  useEffect(() => {
    void reloadAll()
  }, [])

  // 自动选第一个会话
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id)
    } else if (activeId && !conversations.find((c) => c.id === activeId)) {
      setActiveId(conversations[0]?.id ?? '')
    }
  }, [conversations, activeId])

  const usable = providers.filter((p) => p.enabled && p.models.length > 0)

  const goConfig = () => navigate('/profile', { state: { section: 'ai' } })

  const onNewConversation = async () => {
    if (usable.length === 0) {
      await dialog({
        title: '没有可用模型',
        message: '请先到「个人中心 → AI 配置」启用至少一个供应商并选择模型',
        confirmLabel: '去配置',
      })
      goConfig()
      return
    }
    // 用默认模型;若默认不在可用列表里,退到第一个可用 provider 的第一个模型
    let providerId = defaults.defaultProviderId
    let modelId = defaults.defaultModelId
    const def = usable.find((p) => p.id === providerId)
    if (!def || !def.models.includes(modelId)) {
      providerId = usable[0].id
      modelId = usable[0].models[0]
    }
    const r = (await CreateAIConversation(providerId, modelId, '新对话')) as any
    // Wails 多返回:可能是 [Conv, ""] / {0,1} / 直接 Conv 对象
    const created =
      (Array.isArray(r) ? r[0] : r?.['0'] ?? (r && 'id' in r ? r : null)) as
        | ConversationSummary
        | null
    const err =
      (Array.isArray(r) ? r[1] : r?.['1']) as string | undefined
    if (err) {
      await dialog({ title: '创建失败', message: err, confirmLabel: '知道了' })
      return
    }
    await reloadAll()
    if (created?.id) setActiveId(created.id)
  }

  const onDelete = async (id: string) => {
    const err = (await DeleteAIConversation(id)) as unknown as string
    if (err) {
      await dialog({ title: '删除失败', message: err, confirmLabel: '知道了' })
      return
    }
    if (activeId === id) setActiveId('')
    await reloadAll()
  }

  const onRename = async (id: string, title: string) => {
    const err = (await RenameAIConversation(id, title)) as unknown as string
    if (err) {
      await dialog({ title: '重命名失败', message: err, confirmLabel: '知道了' })
      return
    }
    await reloadAll()
  }

  const empty = usable.length === 0

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-info" />
          <span className="text-sm font-medium">AI 问答</span>
        </div>
        <Button size="sm" variant="ghost" onClick={goConfig} title="去个人中心 → AI 配置">
          <SettingsIcon className="h-4 w-4" />
          配置
        </Button>
      </header>

      {empty ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info/15 text-info">
              <MessagesSquare className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold">还没有可用的 AI 供应商</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                请到「个人中心 → AI 配置」添加供应商,
                <br />
                填入 API Key,选择模型
              </p>
            </div>
            <Button onClick={goConfig}>
              <SettingsIcon className="h-4 w-4" />
              去配置
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ConversationList
            list={conversations}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={onNewConversation}
            onDelete={onDelete}
            onRename={onRename}
          />
          {activeId ? (
            <ChatPane
              key={activeId}
              conversationId={activeId}
              onTitleChange={() => void reloadAll()}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              选一个对话,或点左上「新建对话」
            </div>
          )}
        </div>
      )}
    </div>
  )
}
