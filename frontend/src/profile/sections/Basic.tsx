import { Moon, Sun, Monitor } from 'lucide-react'
import { useLayoutStore } from '@/stores/layout'
import { useProfileStore } from '@/stores/profile'
import { cn } from '@/lib/utils'

export function BasicSection() {
  const nickname = useProfileStore((s) => s.nickname)
  const setNickname = useProfileStore((s) => s.setNickname)
  const theme = useLayoutStore((s) => s.theme)
  const setTheme = useLayoutStore((s) => s.setTheme)

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold">基础信息</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          配置昵称与界面偏好，这些信息只存在本地。
        </p>
      </header>

      <Field label="昵称" hint="仅显示在侧边栏与本地，不会被上传">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
          placeholder="给自己起个名字"
        />
      </Field>

      <Field label="主题">
        <div className="flex gap-2">
          <ThemeOption
            active={theme === 'light'}
            onClick={() => setTheme('light')}
            icon={<Sun className="h-4 w-4" />}
            label="浅色"
          />
          <ThemeOption
            active={theme === 'dark'}
            onClick={() => setTheme('dark')}
            icon={<Moon className="h-4 w-4" />}
            label="深色"
          />
          <ThemeOption
            active={theme === 'system'}
            onClick={() => setTheme('system')}
            icon={<Monitor className="h-4 w-4" />}
            label="跟随系统"
          />
        </div>
      </Field>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function ThemeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent',
        active && 'border-foreground/30 bg-accent font-medium'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
