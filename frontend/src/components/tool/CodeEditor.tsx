import { useEffect, useState } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import { useLayoutStore } from '@/stores/layout'

interface CodeEditorProps {
  value: string
  onChange?: (v: string) => void
  extensions?: Extension[]
  readOnly?: boolean
  placeholder?: string
  minHeight?: string
  className?: string
}

function resolveDark(theme: string): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function CodeEditor({
  value,
  onChange,
  extensions = [],
  readOnly,
  placeholder,
  minHeight = '200px',
  className,
}: CodeEditorProps) {
  const theme = useLayoutStore((s) => s.theme)
  const [dark, setDark] = useState(() => resolveDark(theme))

  useEffect(() => {
    if (theme !== 'system') {
      setDark(theme === 'dark')
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setDark(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [theme])

  return (
    <div className={className}>
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        minHeight={minHeight}
        theme={dark ? 'dark' : 'light'}
        extensions={[EditorView.lineWrapping, ...extensions]}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: !readOnly,
          foldGutter: true,
          bracketMatching: true,
          autocompletion: false,
        }}
      />
    </div>
  )
}
