import { getBuiltinLogo, isImageURL } from './provider-logos'
import { cn } from '@/lib/utils'

interface Props {
  logo: string
  name: string
  size?: number
  className?: string
}

/** 渲染优先级:data/url 图片 → 内置 SVG → 名字首字母 */
export function ProviderAvatar({ logo, name, size = 40, className }: Props) {
  const builtin = logo ? getBuiltinLogo(logo) : null
  const isImg = logo && isImageURL(logo)
  const initial = (name?.trim().charAt(0) || 'P').toUpperCase()
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }

  if (isImg) {
    return (
      <img
        src={logo}
        alt={name}
        style={style}
        className={cn(
          'shrink-0 rounded-full border border-border bg-card object-cover',
          className,
        )}
      />
    )
  }

  if (builtin) {
    return (
      <div
        style={style}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground',
          className,
        )}
        dangerouslySetInnerHTML={{
          __html: builtin.svg.replace(
            '<svg ',
            `<svg width="${Math.round(size * 0.6)}" height="${Math.round(size * 0.6)}" `,
          ),
        }}
      />
    )
  }

  return (
    <div
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-info/15 font-semibold text-info',
        className,
      )}
    >
      {initial}
    </div>
  )
}
