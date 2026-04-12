import { Sparkles } from 'lucide-react'

export function PlaceholderSection({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">{title}</h1>
      </header>
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-sm font-medium">即将推出</h2>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
          这个功能还在规划中。后续迭代会在这里接入，当前版本保留占位以便你预览整体结构。
        </p>
      </div>
    </div>
  )
}
