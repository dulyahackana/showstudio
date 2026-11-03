import type { HexColor, Vec3 } from '@studio/schema'
import { type ComponentProps, useEffect, useRef, useState } from 'react'
import { useEditable } from '@/components/editable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Numeric input that keeps the user's text while typing and reports valid
 * numbers immediately (so 3D previews follow along).
 */
export function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  className,
  ...rest
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  className?: string
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max' | 'step'>) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(Number(value.toFixed(4))))
  }, [value])
  return (
    <Input
      {...rest}
      inputMode="decimal"
      type="number"
      step={step}
      min={min}
      max={max}
      className={cn('h-7 px-2 font-mono text-xs tabular-nums', className)}
      value={text}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setText(String(Number(value.toFixed(4))))
      }}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n)
      }}
    />
  )
}

export function Vec3Input({
  value,
  onChange,
  step = 0.1,
}: {
  value: Vec3
  onChange: (v: Vec3) => void
  step?: number
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <div key={axis} className="relative">
          <span className="pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px] text-muted-foreground uppercase">
            {axis}
          </span>
          <NumberInput
            aria-label={axis}
            className="pl-4"
            step={step}
            value={value[i] as number}
            onChange={(n) => {
              const next = [...value] as Vec3
              next[i] = n
              onChange(next)
            }}
          />
        </div>
      ))}
    </div>
  )
}

export function ColorInput({ value, onChange }: { value: HexColor; onChange: (v: HexColor) => void }) {
  const editable = useEditable()
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="color"
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value as HexColor)}
        className="h-7 w-9 cursor-pointer rounded border bg-transparent disabled:cursor-default"
      />
      <span className="font-mono text-xs text-muted-foreground">{value}</span>
    </div>
  )
}

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

/** First error message of a TanStack Form field (string or Standard Schema issue). */
export function fieldError(errors: unknown[]): string | undefined {
  const first = errors[0]
  if (!first) return undefined
  if (typeof first === 'string') return first
  if (typeof first === 'object' && first && 'message' in first) return String((first as { message: unknown }).message)
  return undefined
}
