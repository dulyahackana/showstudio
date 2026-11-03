import { createFileRoute } from '@tanstack/react-router'
import { PageBody } from '@/components/page'
import { DevicesView } from '@/features/fleet/devices-view'

export const Route = createFileRoute('/environments/$id/devices')({ component: DevicesTab })

/** Every controller installed in this environment, and what is staged on it. */
function DevicesTab() {
  const { id } = Route.useParams()
  return (
    <PageBody>
      <DevicesView environmentId={id} />
    </PageBody>
  )
}
