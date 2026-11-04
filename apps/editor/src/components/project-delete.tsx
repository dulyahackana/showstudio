import type { Project } from '@studio/schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArchiveRestore, Ellipsis, History, Trash, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/page'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, problemMessage } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { useCanDeleteProject } from '@/lib/project'
import { docsQuery } from '@/lib/queries'

/*
 * Deleting a project only hides it: read-only, off every list, its show taken off the
 * controllers. Owners and admins can recover it; nothing is erased.
 */

const onError = (err: unknown) => toast.error(problemMessage(err).title, { description: problemMessage(err).detail })

export function useRestoreProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) => api('restoreProject', { params: { projectId } }),
    onSuccess: (p) => {
      qc.setQueryData(['project', p.id], p)
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['docs'] })
      toast.success(`${p.name} recovered`, { description: 'Deploy it again before it can run.' })
    },
    onError,
  })
}

/** The confirmation and the delete itself; then Projects, with Undo. */
export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const restore = useRestoreProject()
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const envName = envs.find((e) => e.id === project.environmentId)?.name ?? project.environmentId
  const remove = useMutation({
    mutationFn: () => api('deleteProject', { params: { projectId: project.id } }),
    onSuccess: (p) => {
      qc.setQueryData(['project', p.id], p)
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['docs'] })
      void navigate({ to: '/projects' })
      toast.success(`${p.name} deleted`, {
        description: 'Recover it any time from Projects → Deleted.',
        action: {
          label: 'Undo',
          onClick: () =>
            restore.mutate(p.id, {
              onSuccess: () => navigate({ to: '/projects/$projectId', params: { projectId: p.id } }),
            }),
        },
      })
    },
    onError,
  })
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from Projects, the sidebar and the overview for the whole team, becomes read-only, and its
            show is taken off every controller of {envName}. Revisions, packages and history are kept. You or an admin
            can recover it from Projects → Deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-danger text-white hover:bg-danger/90"
            onClick={() => remove.mutate()}
            data-testid="confirm-delete-project"
          >
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * "⋯" in the project header. Delete is listed for everyone so it can be found; people
 * who may not delete see it disabled with who can.
 */
export function ProjectMenu({ project }: { project: Project }) {
  const canDelete = useCanDeleteProject(project)
  const [open, setOpen] = useState(false)
  const owners = project.members.filter((m) => m.role === 'owner').map((m) => m.user)
  if (project.deletedAt) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Project actions" data-testid="project-menu">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem asChild>
            <Link to="/projects/$projectId/team" params={{ projectId: project.id }}>
              <Users /> Team and roles
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/projects/$projectId/revisions" params={{ projectId: project.id }}>
              <History /> Revisions and downloads
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canDelete ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen(true)} data-testid="menu-delete-project">
              <Trash /> Delete project…
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled
              className="flex-col items-start gap-0"
              data-testid="menu-delete-project-disabled"
            >
              <span className="flex items-center gap-1.5">
                <Trash /> Delete project
              </span>
              <span className="pl-5.5 text-[11px]">
                Only {owners.length ? owners.map(capitalize).join(', ') : 'owners'} (owner) or an admin
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canDelete && <DeleteProjectDialog project={project} open={open} onOpenChange={setOpen} />}
    </>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Trash button on a Projects list row (owners and admins). */
export function DeleteProjectButton({ project }: { project: Project }) {
  const canDelete = useCanDeleteProject(project)
  const [open, setOpen] = useState(false)
  if (!canDelete) return <span className="size-7" />
  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
        title={`Delete ${project.name}`}
        onClick={(e) => {
          e.preventDefault() // the row is a link
          e.stopPropagation()
          setOpen(true)
        }}
        data-testid={`delete-${project.id}`}
      >
        <Trash />
      </Button>
      <DeleteProjectDialog project={project} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** Owners' and admins' danger zone on the team page. */
export function DeleteProjectPanel({ project }: { project: Project }) {
  const canDelete = useCanDeleteProject(project)
  const [open, setOpen] = useState(false)
  if (!canDelete || project.deletedAt) return null
  return (
    <Panel className="border-danger/30">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex-1">
          <div className="font-semibold">Delete project</div>
          <p className="text-sm text-muted-foreground">
            Hides it from everyone and takes its show off the controllers. Nothing is erased; you can recover it.
          </p>
        </div>
        <Button variant="outline" className="text-danger" onClick={() => setOpen(true)} data-testid="delete-project">
          <Trash /> Delete
        </Button>
      </div>
      <DeleteProjectDialog project={project} open={open} onOpenChange={setOpen} />
    </Panel>
  )
}

/** Shown across a deleted project's pages. */
export function DeletedBanner({ project }: { project: Project }) {
  const canRecover = useCanDeleteProject(project)
  const restore = useRestoreProject()
  if (!project.deletedAt) return null
  return (
    <div
      className="flex items-center gap-3 border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm"
      data-testid="deleted-banner"
    >
      <Trash className="size-4 text-danger" />
      <span className="flex-1">
        Deleted by <span className="capitalize">{project.deletedBy}</span> {timeAgo(project.deletedAt)}. Read-only until
        it is recovered.
      </span>
      {canRecover && (
        <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => restore.mutate(project.id)}>
          <ArchiveRestore /> Recover
        </Button>
      )}
    </div>
  )
}

/** One deleted project in the Projects page's Deleted list. */
export function DeletedProjectRow({ project }: { project: Project }) {
  const canRecover = useCanDeleteProject(project)
  const restore = useRestoreProject()
  return (
    <div className="flex items-center gap-4 px-5 py-3" data-testid={`deleted-${project.id}`}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-muted-foreground">{project.name}</span>
        <span className="text-[11px] text-muted-foreground">
          <span className="font-mono">{project.id}</span> · deleted by{' '}
          <span className="capitalize">{project.deletedBy}</span> {timeAgo(project.deletedAt)}
        </span>
      </span>
      {canRecover && (
        <Button
          size="sm"
          variant="outline"
          disabled={restore.isPending}
          onClick={() => restore.mutate(project.id)}
          data-testid={`recover-${project.id}`}
        >
          <ArchiveRestore /> Recover
        </Button>
      )}
    </div>
  )
}
