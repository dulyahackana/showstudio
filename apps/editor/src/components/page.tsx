import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  children,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-8 pt-7 pb-2">
      <div className="min-w-0">
        {eyebrow && <div className="text-eyebrow mb-1">{eyebrow}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl truncate text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex-1 space-y-8 overflow-auto px-8 py-6', className)}>{children}</div>
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Raised panel used for dashboard and console blocks. */
export function Panel({ children, className, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-xl border bg-card shadow-[0_1px_0_0_oklch(1_0_0/4%)_inset]', className)} {...rest}>
      {children}
    </div>
  )
}
