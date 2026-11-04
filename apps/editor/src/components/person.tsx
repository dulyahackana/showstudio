import { cn } from '@/lib/utils'

/* One colour per person, the same on every screen. Known personas get their login-tile hue. */
const HUES: Record<string, number> = { alice: 195, sam: 280, olga: 230, priya: 155, tom: 330 }
const SPARE = [155, 195, 230, 255, 280, 330]

function hueOf(name: string) {
  const known = HUES[name]
  if (known !== undefined) return known
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return SPARE[h % SPARE.length] as number
}

export function PersonAvatar({ name, className, title }: { name: string; className?: string; title?: string }) {
  const admin = name === 'admin'
  const hue = hueOf(name)
  return (
    <span
      title={title}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase ring-2 ring-background',
        className,
      )}
      style={
        admin
          ? { background: 'var(--muted)', color: 'var(--muted-foreground)' }
          : { background: `oklch(0.36 0.07 ${hue})`, color: `oklch(0.9 0.08 ${hue})` }
      }
    >
      {name.slice(0, 2)}
    </span>
  )
}
