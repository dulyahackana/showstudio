import { useForm } from '@tanstack/react-form'
import { Plus } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { z } from 'zod'
import { fieldError } from '@/components/fields'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { problemMessage } from '@/lib/api'
import { slugify } from '@/lib/format'

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'Lowercase letters, digits, "-" or "_"')

/**
 * Shared "create" dialog: name + stable id (TanStack Form), plus kind-specific
 * extra fields rendered by the caller.
 */
export function NewDocumentDialog<Extra>({
  title,
  description,
  label,
  disabled,
  extra,
  initialExtra,
  onCreate,
}: {
  title: string
  description: string
  label: string
  disabled?: boolean
  initialExtra: Extra
  extra?: (value: Extra, set: (v: Extra) => void) => ReactNode
  onCreate: (v: { id: string; name: string; extra: Extra }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extraValue, setExtraValue] = useState<Extra>(initialExtra)

  const form = useForm({
    defaultValues: { name: '', id: '' },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await onCreate({ id: value.id || slugify(value.name), name: value.name, extra: extraValue })
        setOpen(false)
        form.reset()
        setExtraValue(initialExtra)
      } catch (err) {
        const p = problemMessage(err)
        setError([p.title, p.detail].filter(Boolean).join(': '))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled} data-testid="new-document">
          <Plus /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field name="name" validators={{ onChange: z.string().min(1, 'Required').max(120) }}>
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="doc-name">Name</FieldLabel>
                  <Input
                    id="doc-name"
                    autoFocus
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                      if (!form.getFieldMeta('id')?.isDirty)
                        form.setFieldValue('id', slugify(e.target.value), { dontUpdateMeta: true })
                    }}
                  />
                  <FieldError>{fieldError(field.state.meta.errors)}</FieldError>
                </Field>
              )}
            </form.Field>
            <form.Field name="id" validators={{ onChange: idSchema }}>
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="doc-id">Id</FieldLabel>
                  <Input
                    id="doc-id"
                    className="font-mono"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldDescription>Stable identifier used by devices, revisions and the API.</FieldDescription>
                  <FieldError>{fieldError(field.state.meta.errors)}</FieldError>
                </Field>
              )}
            </form.Field>
            {extra?.(extraValue, setExtraValue)}
          </FieldGroup>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <DialogFooter className="mt-4">
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
              {([canSubmit, submitting]) => (
                <Button type="submit" disabled={!canSubmit || submitting} data-testid="create-document">
                  {submitting ? 'Creating…' : 'Create'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
