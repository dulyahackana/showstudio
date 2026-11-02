import type { Issue } from '@studio/schema'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { IssuesList } from '@/components/issues-list'
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api } from '@/lib/api'
import { qk } from '@/lib/queries'
import { useDocPermission } from '@/lib/project'
import { useCan } from '@/lib/session'

/**
 * Freeze the current draft as an immutable revision. The server re-runs the
 * same validation and refuses to publish while errors remain.
 */
export function PublishDialog({
  docId,
  draftVersion,
  issues,
  flush,
  requiresReview,
  projectId,
}: {
  projectId: string
  docId: string
  draftVersion: number
  issues: Issue[]
  flush: () => Promise<void>
  requiresReview: boolean
}) {
  const [open, setOpen] = useState(false)
  const [serverIssues, setServerIssues] = useState<Issue[] | null>(null)
  const qc = useQueryClient()
  const canPublishRole = useCan('publish')
  const canPublishProject = useDocPermission(projectId, 'edit')
  const canPublish = canPublishRole && canPublishProject
  const errors = issues.filter((i) => i.severity === 'error')

  const publish = useMutation({
    mutationFn: async (note: string) => {
      await flush()
      const doc = await api('getDocument', { params: { id: docId } })
      return api('publish', { params: { id: docId }, body: { draftVersion: doc.draftVersion, note } })
    },
    onSuccess: (rev) => {
      toast.success(`Published revision ${rev.revision}`, {
        description: requiresReview ? 'Waiting for safety review before it can be deployed.' : undefined,
      })
      void qc.invalidateQueries({ queryKey: qk.revisions(docId) })
      void qc.invalidateQueries({ queryKey: qk.doc(docId) })
      void qc.invalidateQueries({ queryKey: ['docs'] })
      setOpen(false)
    },
    onError: (err) => {
      if (err instanceof ApiError && err.problem.issues) setServerIssues(err.problem.issues)
      else toast.error('Publish failed', { description: err.message })
    },
  })

  const form = useForm({
    defaultValues: { note: '' },
    validators: { onChange: z.object({ note: z.string().max(500, 'Keep it under 500 characters') }) },
    onSubmit: ({ value }) => publish.mutateAsync(value.note).catch(() => {}),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        setServerIssues(null)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={!canPublish} data-testid="publish">
          <Upload /> Publish
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish revision</DialogTitle>
          <DialogDescription>
            Draft version {draftVersion} becomes an immutable revision
            {requiresReview ? ' and goes to safety review.' : ' that other documents can pin.'}
          </DialogDescription>
        </DialogHeader>
        {(serverIssues ?? errors).length > 0 && (
          <div className="max-h-56 overflow-hidden rounded-md border">
            <IssuesList issues={serverIssues ?? errors} />
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
          className="space-y-4"
        >
          <form.Field name="note">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="note">What changed?</FieldLabel>
                <Textarea
                  id="note"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="e.g. Slower jaw, new door reaction"
                />
                <FieldDescription>Shown in the revision history and the audit log.</FieldDescription>
              </Field>
            )}
          </form.Field>
          <DialogFooter>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(submitting) => (
                <Button type="submit" disabled={errors.length > 0 || submitting} data-testid="confirm-publish">
                  {errors.length > 0 ? `Fix ${errors.length} error(s) first` : submitting ? 'Publishing…' : 'Publish'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
