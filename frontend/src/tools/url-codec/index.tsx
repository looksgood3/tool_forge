import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { ToolShell } from '@/components/tool/ToolShell'
import { TextPanel } from '@/components/tool/TextPanel'
import { ModeToggle } from '@/components/tool/ModeToggle'
import { Button } from '@/components/ui/button'
import { meta } from './meta'
import { decodeUrl, encodeUrl } from './logic'

type Mode = 'encode' | 'decode'

const EXAMPLE = 'https://example.com/search?q=你好 世界&lang=zh-CN'

export default function UrlCodec() {
  const [mode, setMode] = useState<Mode>('encode')
  const [input, setInput] = useState('')

  const { output, error } = useMemo(() => {
    try {
      const value = mode === 'encode' ? encodeUrl(input) : decodeUrl(input)
      return { output: value, error: '' }
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message : '解析失败' }
    }
  }, [input, mode])

  const handleSwap = () => {
    setMode((m) => (m === 'encode' ? 'decode' : 'encode'))
    if (output) setInput(output)
  }

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      onClear={() => setInput('')}
      onLoadExample={() => {
        setMode('encode')
        setInput(EXAMPLE)
      }}
      actions={
        <>
          <ModeToggle
            value={mode}
            onChange={setMode}
            options={[
              { value: 'encode', label: '编码' },
              { value: 'decode', label: '解码' },
            ]}
          />
          <Button variant="ghost" size="sm" onClick={handleSwap} title="交换">
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
        </>
      }
    >
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-2">
        <TextPanel
          label={mode === 'encode' ? '原文' : '编码后字符串'}
          value={input}
          onChange={setInput}
        />
        <TextPanel
          label={mode === 'encode' ? '编码后字符串' : '原文'}
          value={output}
          error={error}
          readOnly
        />
      </div>
    </ToolShell>
  )
}
