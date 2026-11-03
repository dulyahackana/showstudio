import { createFileRoute } from '@tanstack/react-router'
import { OperatorConsole } from '@/features/fleet/operator-console'

export const Route = createFileRoute('/environments/$id/operate')({ component: OperateTab })

/** The control room: launch, swap and stop the shows staged here; e-stop. */
function OperateTab() {
  const { id } = Route.useParams()
  return <OperatorConsole environmentId={id} />
}
