import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { PageBody, Panel } from '@/components/page'
import { RevisionsPanel } from '@/components/revisions-panel'
import { Button } from '@/components/ui/button'
import { projectQuery, useProjectCan } from '@/lib/project'
import { useCan } from '@/lib/session'

export const Route = createFileRoute('/projects/$projectId/review')({ component: ReviewStep })

/** Step 2: every published revision, with four-eyes safety approval. Approval signs the bundle. */
function ReviewStep() {
  const { projectId } = Route.useParams()
  const { data: project } = useQuery(projectQuery(projectId))
  const approved = project?.show.latestApprovedRevision
  const deployRole = useCan('createDeployment')
  const projectOperator = useProjectCan('operate', project)
  return (
    <PageBody>
      <Panel className="overflow-hidden">
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <ShieldCheck className="mt-0.5 size-5 text-ok" />
          <div className="flex-1">
            <div className="font-semibold">Safety review</div>
            <p className="text-sm text-muted-foreground">
              A reviewer checks the published revision against the figures' limits and the sensor responses. Authors
              cannot approve their own work. Approval signs the exact bundle the devices will run.
            </p>
          </div>
          {approved && deployRole && projectOperator && (
            <Button size="sm" asChild>
              <Link to="/projects/$projectId/deploy" params={{ projectId }}>
                Next: deploy r{approved} <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
        <RevisionsPanel docId={projectId} kind="show" />
      </Panel>
    </PageBody>
  )
}
