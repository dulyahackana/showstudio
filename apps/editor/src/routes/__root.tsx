import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { LoginScreen } from '@/components/login-screen'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { problemMessage } from '@/lib/api'
import { useSession } from '@/lib/session'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Not found</EmptyTitle>
        <EmptyDescription>This page does not exist.</EmptyDescription>
      </EmptyHeader>
      <Button asChild variant="outline">
        <Link to="/">Back to overview</Link>
      </Button>
    </Empty>
  ),
  errorComponent: ({ error, reset }) => (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{problemMessage(error).title}</EmptyTitle>
        <EmptyDescription>{problemMessage(error).detail}</EmptyDescription>
      </EmptyHeader>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </Empty>
  ),
})

/* The editors (timeline, layout, character) want every pixel for the 3D view. */
const EDITOR = [/^\/projects\/[^/]+\/show\/?$/, /^\/environments\/[^/]+\/?$/, /^\/characters\/[^/]+\/?$/]
const SIDEBAR_KEY = 'studio.sidebar'

/**
 * The sidebar is open on pages and folded to icons in editors by default. Each mode
 * remembers its own choice, so opening it in one editor keeps it open in the others.
 */
function useSidebarMode() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const mode = EDITOR.some((re) => re.test(path)) ? 'editor' : 'page'
  const [prefs, setPrefs] = useState<Record<'page' | 'editor', boolean>>(() => {
    try {
      return { page: true, editor: false, ...JSON.parse(localStorage.getItem(SIDEBAR_KEY) ?? '{}') }
    } catch {
      return { page: true, editor: false }
    }
  })
  return {
    open: prefs[mode],
    onOpenChange: (open: boolean) => {
      const next = { ...prefs, [mode]: open }
      setPrefs(next)
      try {
        localStorage.setItem(SIDEBAR_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable: defaults next time */
      }
    },
  }
}

function Root() {
  const session = useSession()
  const sidebar = useSidebarMode()
  if (!session.token) return <LoginScreen />
  return (
    <SidebarProvider open={sidebar.open} onOpenChange={sidebar.onOpenChange}>
      <AppSidebar />
      <SidebarInset className="flex h-svh flex-col overflow-hidden">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2 md:hidden">
          <SidebarTrigger />
        </div>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
