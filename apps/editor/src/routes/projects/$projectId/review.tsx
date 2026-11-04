import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, History, ShieldCheck, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { PageBody, Panel } from '@/components/page'
import { DiffView, useReview } from '@/components/revisions-panel'
import { RevisionBadge } from '@/components/status'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { timeAgo } from '@/lib/format'
import { projectQuery, useProjectCan } from '@/lib/project'
import { revisionsQuery } from '@/lib/queries'
import { canCall, useCan, useUser } from '@/lib/session'

export const Route = createFileRoute('/projects/$projectId/review')({ component: ReviewStep })

/**
 * Step 2: the revisions waiting for a safety reviewer, each with what changed. Authors
 * never approve their own work; approval signs the exact bundle. The full history lives
 * in the project's Revisions page.
 */
function ReviewStep() {
  const { projectId } = Route.useParams()
  const user = useUser()
  const { data: project } = useQuery(projectQuery(projectId))
  const { data: revisions = [] } = useQuery(revisionsQuery(projectId))
  const reviewRole = useProjectCan('review', project)
  const deployRole = useCan('createDeployment')
  const projectOperator = useProjectCan('operate', project)
  const review = useReview(projectId)
  const [deciding, setDeciding] = useState<{ revision: number; author: string; decision: 'approve' | 'reject' } | null>(
    null,
  )
  const [checked, setChecked] = useState(false)
  const [note, setNote] = useState('')
  const decide = (revision: number, author: string, decision: 'approve' | 'reject') => {
    setChecked(false)
    setNote('')
    setDeciding({ revision, author, decision })
  }
  const pending = revisions.filter((r) => r.status === 'published')
  const decided = revisions.find((r) => r.status !== 'published')
  const approved = project?.show.latestApprovedRevision

  return (
    <PageBody>
      <Panel className="overflow-hidden">
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <ShieldCheck className="mt-0.5 size-5 text-ok" />
          <div className="flex-1">
            <div className="font-semibold">Safety review</div>
            <p className="text-sm text-muted-foreground">
              A reviewer checks each published revision against the figures' limits and the sensor responses. Authors
              cannot approve their own work. Approval signs the exact bundle the devices will run.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="ghost" asChild>
              <Link to="/projects/$projectId/revisions" params={{ projectId }}>
                <History /> All revisions
              </Link>
            </Button>
            {approved && pending.length === 0 && deployRole && projectOperator && (
              <Button size="sm" asChild>
                <Link to="/projects/$projectId/deploy" params={{ projectId }}>
                  Next: deploy r{approved} <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
            <span>Nothing is waiting for review.</span>
            {decided && (
              <span className="flex items-center gap-2">
                Last decision: <span className="font-mono text-foreground">r{decided.revision}</span>
                <RevisionBadge status={decided.status} /> by <span className="capitalize">{decided.reviewedBy}</span>
                {timeAgo(decided.reviewedAt)}
              </span>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {pending.map((r) => {
              const own = user?.name === r.publishedBy
              const canReview = canCall(user, 'approveRevision') && reviewRole && !own
              return (
                <div
                  key={r.revision}
                  className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                  data-testid={`pending-r${r.revision}`}
                >
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">r{r.revision}</span>
                      <RevisionBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">
                        published by <span className="capitalize">{r.publishedBy}</span> {timeAgo(r.publishedAt)}
                      </span>
                    </div>
                    {r.note && <p className="text-sm">{r.note}</p>}
                    <div className="rounded-md border bg-sidebar/50 p-3">
                      <p className="text-eyebrow mb-2">
                        {r.revision === 1 ? 'First revision' : `Changes since r${r.revision - 1}`}
                      </p>
                      <DiffView docId={projectId} revision={r.revision} />
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    {canReview ? (
                      <>
                        <Button
                          size="sm"
                          disabled={review.isPending}
                          onClick={() => decide(r.revision, r.publishedBy, 'approve')}
                          data-testid={`approve-r${r.revision}`}
                        >
                          <ShieldCheck /> Approve and sign
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={review.isPending}
                          onClick={() => decide(r.revision, r.publishedBy, 'reject')}
                          data-testid={`reject-r${r.revision}`}
                        >
                          <ShieldX /> Reject
                        </Button>
                      </>
                    ) : (
                      <p className="max-w-60 text-xs text-muted-foreground">
                        {own
                          ? 'You published this revision. Another safety reviewer on the team must approve it.'
                          : 'Waiting for a safety reviewer on this project.'}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      <AlertDialog open={!!deciding} onOpenChange={(open) => !open && setDeciding(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deciding?.decision === 'approve'
                ? `Approve and sign r${deciding.revision}?`
                : `Send r${deciding?.revision} back to ${capitalize(deciding?.author ?? '')}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deciding?.decision === 'approve'
                ? 'Signing makes this exact bundle deployable: every controller will accept it. It cannot be changed afterwards.'
                : 'The author sees your reason on the project and publishes a fixed revision.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deciding?.decision === 'approve' && (
            <Label className="flex items-start gap-3 rounded-lg border bg-surface-2/60 p-3 text-sm leading-snug">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
                className="mt-0.5"
                data-testid="review-checked"
              />
              I checked the changes against the figures' limits and the sensor responses.
            </Label>
          )}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder={deciding?.decision === 'approve' ? 'Note (optional)' : 'What needs to change? (required)'}
            data-testid="review-note"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={deciding?.decision === 'reject' ? 'bg-danger text-white hover:bg-danger/90' : undefined}
              disabled={deciding?.decision === 'approve' ? !checked : !note.trim()}
              onClick={() =>
                deciding &&
                review.mutate({ revision: deciding.revision, decision: deciding.decision, note: note.trim() })
              }
              data-testid="confirm-review"
            >
              {deciding?.decision === 'approve' ? 'Approve and sign' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageBody>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
