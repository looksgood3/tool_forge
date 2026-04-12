import { useState } from 'react'
import { ToolShell } from '@/components/tool/ToolShell'
import { meta } from './meta'
import { formatNumber, parseNumber, type Base } from './logic'
import { cn } from '@/lib/utils'

interface Values {
  bin: string
  oct: string
  dec: string
  hex: string
}

const EMPTY: Values = { bin: '', oct: '', dec: '', hex: '' }
const EXAMPLE: Values = convertFrom('dec', '255')

function convertFrom(from: keyof Values, raw: string): Values {
  if (!raw.trim()) return EMPTY
  const base: Base = from === 'bin' ? 2 : from === 'oct' ? 8 : from === 'dec' ? 10 : 16
  try {
    const value = parseNumber(raw, base)
    return {
      bin: formatNumber(value, 2),
      oct: formatNumber(value, 8),
      dec: formatNumber(value, 10),
      hex: formatNumber(value, 16),
    }
  } catch {
    return { ...EMPTY, [from]: raw }
  }
}

export default function NumberBase() {
  const [values, setValues] = useState<Values>(EMPTY)
  const [errorField, setErrorField] = useState<keyof Values | ''>('')

  const handleChange = (field: keyof Values, raw: string) => {
    if (!raw.trim()) {
      setValues(EMPTY)
      setErrorField('')
      return
    }
    const base: Base = field === 'bin' ? 2 : field === 'oct' ? 8 : field === 'dec' ? 10 : 16
    try {
      const value = parseNumber(raw, base)
      setValues({
        bin: formatNumber(value, 2),
        oct: formatNumber(value, 8),
        dec: formatNumber(value, 10),
        hex: formatNumber(value, 16),
      })
      setErrorField('')
    } catch {
      setValues((prev) => ({ ...prev, [field]: raw }))
      setErrorField(field)
    }
  }

  return (
    <ToolShell
      title={meta.title}
      description={meta.description}
      onClear={() => {
        setValues(EMPTY)
        setErrorField('')
      }}
      onLoadExample={() => {
        setValues(EXAMPLE)
        setErrorField('')
      }}
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <Row
          label="二进制 (BIN)"
          prefix="0b"
          value={values.bin}
          onChange={(v) => handleChange('bin', v)}
          error={errorField === 'bin'}
        />
        <Row
          label="八进制 (OCT)"
          prefix="0o"
          value={values.oct}
          onChange={(v) => handleChange('oct', v)}
          error={errorField === 'oct'}
        />
        <Row
          label="十进制 (DEC)"
          value={values.dec}
          onChange={(v) => handleChange('dec', v)}
          error={errorField === 'dec'}
        />
        <Row
          label="十六进制 (HEX)"
          prefix="0x"
          value={values.hex}
          onChange={(v) => handleChange('hex', v)}
          error={errorField === 'hex'}
        />
      </div>
    </ToolShell>
  )
}

function Row({
  label,
  prefix,
  value,
  onChange,
  error,
}: {
  label: string
  prefix?: string
  value: string
  onChange: (v: string) => void
  error?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border bg-card px-3 h-11',
          error ? 'border-destructive' : 'border-border focus-within:border-foreground/30'
        )}
      >
        {prefix && (
          <span className="font-mono text-xs text-muted-foreground">{prefix}</span>
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder="输入数字…"
          className="flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {error && <span className="text-xs text-destructive">格式错误</span>}
      </div>
    </div>
  )
}
