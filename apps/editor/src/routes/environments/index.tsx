import { createFileRoute, redirect } from '@tanstack/react-router'

/** Environments live under their location. */
export const Route = createFileRoute('/environments/')({
  beforeLoad: () => {
    throw redirect({ to: '/locations' })
  },
})
