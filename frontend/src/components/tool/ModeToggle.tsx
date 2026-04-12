import { cn } from '@/lib/utils'

interface ModeToggleProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

export function ModeToggle<T extends string>({
  value,
  options,
  onChange,
}: ModeToggleProps<T>) {
  return (
    <div className="flex rounded-md border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'h-7 rounded-sm px-3 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
