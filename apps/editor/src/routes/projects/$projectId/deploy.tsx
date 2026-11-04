import type { Project } from '@studio/schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Rocket } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageBody, Panel } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DevicesView } from '@/features/fleet/devices-view'
import { api, problemMessage } from '@/lib/api'
import { shortSha } from '@/lib/format'
import { projectQuery, useProjectCan, useProjectStage } from '@/lib/project'
import { docsQuery, envStatusQuery, qk, revisionsQuery } from '@/lib/queries'
import { useCan } from '@/lib/session'

export const Route = createFileRoute('/projects/$projectId/deploy')({ component: DeployStep })

/** Step 3: send an approved, signed revision to every controller of the environment. */
function DeployStep() {
  const { projectId } = Route.useParams()
  const { data: project } = useQuery(projectQuery(projectId))
  const deployRole = useCan('createDeployment')
  const projectOperator = useProjectCan('operate', project)
  if (!project) return null
  return (
    <PageBody>
      <DevicesView environmentId={project.environmentId} showId={project.id}>
        {deployRole && projectOperator && <DeployPanel project={project} />}
      </DevicesView>
    </PageBody>
  )
}

function DeployPanel({ project }: { project: Project }) {
  const qc = useQueryClient()
  const stage = useProjectStage(project)
  const { data: revisions = [] } = useQuery(revisionsQuery(project.id))
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const envName = envs.find((e) => e.id === project.environmentId)?.name ?? project.environmentId
  const approved = revisions.filter((r) => r.status === 'approved')
  const [picked, setPicked] = useState<number | null>(null)
  const revision = picked ?? approved[0]?.revision ?? null
  const [reasons, setReasons] = useState<string[] | null>(null)
  const { data: status } = useQuery(envStatusQuery(project.environmentId))
  const staged = status?.prepared.find((p) => p.showId === project.id && p.revision === revision)

  const deploy = useMutation({
    mutationFn: () => api('createDeployment', { body: { showId: project.id, revision: revision ?? 0 } }),
    onMutate: () => setReasons(null),
    onSuccess: (d) => {
      toast.success(`Deploying ${d.name} r${d.revision}`, {
        description: `${d.targets.length} devices will download, verify and stage it.`,
      })
      void qc.invalidateQueries({ queryKey: qk.deployments(project.environmentId) })
    },
    onError: (err) => {
      const p = problemMessage(err)
      setReasons(p.reasons ?? [p.detail ?? p.title])
    },
  })

  return (
    <Panel className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Rocket className="mt-0.5 size-5 text-primary" />
        <div>
          <div className="font-semibold">Deploy to {envName}</div>
          <p className="text-sm text-muted-foreground">
            Only approved, signed revisions go out. Every controller must be online, verify the signature and accept its
            own limits, or nothing is staged (all or nothing).
          </p>
        </div>
      </div>
      {approved.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3 text-sm">
          <span className="text-muted-foreground">No approved revision yet.</span>
          <Button size="sm" variant="outline" asChild>
            <Link to="/projects/$projectId/review" params={{ projectId: project.id }}>
              Go to Review
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Select value={revision ? String(revision) : ''} onValueChange={(v) => setPicked(Number(v))}>
            <SelectTrigger className="flex-1" data-testid="deploy-revision-select">
              <SelectValue placeholder="Approved revision" />
            </SelectTrigger>
            <SelectContent>
              {approved.map((r) => (
                <SelectItem key={r.revision} value={String(r.revision)}>
                  r{r.revision} · approved by {r.reviewedBy} · {shortSha(r.bundleSha256)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={staged?.goodToGo ? 'outline' : 'default'}
            disabled={!revision || deploy.isPending}
            onClick={() => deploy.mutate()}
            data-testid="deploy-show"
          >
            <Rocket /> {deploy.isPending ? 'Deploying…' : staged?.goodToGo ? 'Redeploy' : 'Deploy'}
          </Button>
        </div>
      )}
      {reasons && (
        <Alert variant="destructive">
          <AlertTitle>Not deployed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {staged && !staged.goodToGo && (
        <p className="text-sm text-muted-foreground">
          Staging r{staged.revision}: {staged.stagedOn} of {staged.targets} controllers verified.
        </p>
      )}
      {(staged?.goodToGo || stage.stage === 'launch') && (
        <div className="space-y-2">
          {staged?.goodToGo && (
            <p className="text-sm text-ok">
              r{staged.revision} is on all {staged.targets} controllers of {envName}, verified.
            </p>
          )}
          <Button className="w-full" asChild>
            <Link to="/projects/$projectId/launch" params={{ projectId: project.id }} data-testid="next-launch">
              Next: launch <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </Panel>
  )
}
