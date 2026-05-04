import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ProvidersTab } from './aichat/ProvidersTab'
import { DefaultsTab } from './aichat/DefaultsTab'

type SubTab = 'providers' | 'defaults'

export function AIChatSection() {
  const [tab, setTab] = useState<SubTab>('providers')

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold">AI 配置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          配置 OpenAI 兼容供应商,选择默认模型,供「AI 问答」工具使用。
        </p>
      </header>

      {/* 顶部子 Tab */}
      <div className="flex h-10 items-center gap-1 border-b border-border">
        <SubTabButton active={tab === 'providers'} onClick={() => setTab('providers')}>
          模型服务
        </SubTabButton>
        <SubTabButton active={tab === 'defaults'} onClick={() => setTab('defaults')}>
          默认模型
        </SubTabButton>
      </div>

      {tab === 'providers' ? <ProvidersTab /> : <DefaultsTab />}
    </div>
  )
}

function SubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative h-10 px-4 text-sm transition-colors',
        active
          ? 'font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-1 bottom-[-1px] h-0.5 rounded-full bg-info" />
      )}
    </button>
  )
}
