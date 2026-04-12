import { Link } from 'react-router-dom'
import { getAllTools, CATEGORY_LABELS } from '@/stores/tools'

export function Home() {
  const tools = getAllTools()
  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Tool Forge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          给程序员的一站式工具箱 · 轻量、一致、可扩展
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.id}
              to={tool.path}
              className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{tool.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {CATEGORY_LABELS[tool.category]}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                {tool.description}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
