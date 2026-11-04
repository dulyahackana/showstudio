import { createFileRoute } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { PageBody, Panel } from '@/components/page'
import { RevisionsPanel } from '@/components/revisions-panel'

export const Route = createFileRoute('/projects/$projectId/revisions')({ component: RevisionsCatalog })

/** Every published revision of the show: download one, restore it as the draft, or redeploy an approved one. */
function RevisionsCatalog() {
  const { projectId } = Route.useParams()
  return (
    <PageBody>
      <Panel className="overflow-hidden">
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <History className="mt-0.5 size-5 text-primary" />
          <div>
            <div className="font-semibold">Revisions</div>
            <p className="text-sm text-muted-foreground">
              Every published version of this show. Published revisions never change. Download any of them, restore one
              as the draft to publish it again (it goes through safety review like any other), or deploy an approved one
              to roll the attraction back.
            </p>
          </div>
        </div>
        <RevisionsPanel docId={projectId} kind="show" />
      </Panel>
    </PageBody>
  )
}
