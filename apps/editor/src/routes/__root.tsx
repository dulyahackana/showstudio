import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
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

function Root() {
  const session = useSession()
  if (!session.token) return <LoginScreen />
  return (
    <SidebarProvider>
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
