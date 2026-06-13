import { useState } from 'react'
import { ToolShell } from '@/components/tool/ToolShell'
import { ModeToggle } from '@/components/tool/ModeToggle'
import { meta } from './meta'
import { FileHashPane } from './FileHashPane'
import { VerifyPane } from './VerifyPane'
import { TextHashPane } from './TextHashPane'

type Tab = 'file' | 'verify' | 'text'

export default function Hash() {
  const [tab, setTab] = useState<Tab>('file')

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      fullBleed
      actions={
        <ModeToggle
          value={tab}
          onChange={setTab}
          options={[
            { value: 'file', label: '文件' },
            { value: 'verify', label: '校验' },
            { value: 'text', label: '文本' },
          ]}
        />
      }
    >
      <div className="min-h-0 flex-1 overflow-auto p-4" data-tool-scroll="true">
        {tab === 'file' && <FileHashPane />}
        {tab === 'verify' && <VerifyPane />}
        {tab === 'text' && <TextHashPane />}
      </div>
    </ToolShell>
  )
}
