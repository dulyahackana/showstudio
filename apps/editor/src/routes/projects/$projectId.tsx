import { PROJECT_PERMISSIONS, type ProjectPermission, ProjectRole } from '@studio/schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Bot, Check, Clapperboard, Info, Mountain, ShieldCheck, Trash, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { RoleBadge } from '@/components/project-switcher'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, problemMessage } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { selectProject, useProjectCan, workspaceQuery } from '@/lib/project'
import { useUser } from '@/lib/session'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/projects/$projectId')({ component: ProjectPage })

const PERMISSION_LABEL: Record<ProjectPermission, { label: string; hint: string }> = {
  read: { label: 'View', hint: 'documents, revisions, fleet status' },
  edit: { label: 'Author & publish', hint: 'figures, attractions, shows' },
  review: { label: 'Safety review', hint: 'approve and sign revisions (never your own)' },
  operate: { label: 'Deploy & launch', hint: 'stage, launch, stop, reset e-stop' },
  manage: { label: 'Manage access', hint: 'invite, change roles, revoke' },
}

const ROLES = ProjectRole.options

function ProjectPage() {
  const { projectId } = Route.useParams()
  const qc = useQueryClient()
  const me = useUser()
  const { data: project, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api('getProject', { params: { projectId } }),
  })
  const { data: workspace } = useQuery(workspaceQuery)
  const canManage = useProjectCan('manage', project ?? null)
  const [invitee, setInvitee] = useState('')
  useEffect(() => {
    if (project) selectProject(project.id)
  }, [project])
  const [inviteRole, setInviteRole] = useState<ProjectRole>('viewer')

  const refresh = (next: unknown) => {
    qc.setQueryData(['project', projectId], next)
    void qc.invalidateQueries({ queryKey: ['projects'] })
  }
  const onError = (err: unknown) => toast.error(problemMessage(err).title, { description: problemMessage(err).detail })
  const setRole = useMutation({
    mutationFn: ({ user, role }: { user: string; role: ProjectRole }) =>
      api('setProjectMember', { params: { projectId, user }, body: { role } }),
    onSuccess: refresh,
    onError,
  })
  const remove = useMutation({
    mutationFn: (user: string) => api('removeProjectMember', { params: { projectId, user } }),
    onSuccess: refresh,
    onError,
  })

  if (error) return <p className="p-8 text-sm text-muted-foreground">{problemMessage(error).detail}</p>
  if (!project) return null
  const person = (name: string) => workspace?.directory.find((p) => p.name === name)
  const outsiders = (workspace?.directory ?? []).filter((p) => !project.members.some((m) => m.user === p.name))

  return (
    <>
      <PageHeader
        eyebrow={`${workspace?.name ?? 'Workspace'} · project`}
        title={project.name}
        description={project.description || 'No description.'}
        actions={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Your role <RoleBadge role={project.myRole} className="text-xs" />
          </div>
        }
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ['character', 'Figures', Bot, '/characters'],
              ['environment', 'Attractions', Mountain, '/environments'],
              ['show', 'Shows', Clapperboard, '/shows'],
            ] as const
          ).map(([kind, label, Icon, to]) => (
            <Link key={kind} to={to} onClick={() => selectProject(project.id)}>
              <Panel className="flex items-center gap-4 p-5 transition hover:border-primary/40">
                <span className="flex size-10 items-center justify-center rounded-lg border bg-surface-2">
                  <Icon className="size-5 text-muted-foreground" />
                </span>
                <div>
                  <div className="text-eyebrow">{label}</div>
                  <div className="text-2xl font-semibold tabular">{project.counts[kind]}</div>
                </div>
              </Panel>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <span className="font-semibold">Members ({project.members.length})</span>
              <span className="text-xs text-muted-foreground">Access is granted per project</span>
            </div>
            <div className="divide-y">
              {project.members.map((m) => {
                const p = person(m.user)
                return (
                  <div key={m.user} className="flex items-center gap-3 px-5 py-3" data-testid={`member-${m.user}`}>
                    <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold uppercase">
                      {m.user.slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {p?.displayName ?? m.user}
                        {m.user === me?.name && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p?.title ?? 'external'} · added by {m.addedBy} {timeAgo(m.addedAt)}
                      </div>
                    </div>
                    {canManage ? (
                      <Select value={m.role} onValueChange={(role) => setRole.mutate({ user: m.user, role: role as ProjectRole })}>
                        <SelectTrigger size="sm" className="w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <RoleBadge role={m.role} className="text-xs" />
                    )}
                    {canManage && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${m.user}`}
                        onClick={() => remove.mutate(m.user)}
                        disabled={remove.isPending}
                      >
                        <Trash />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
            {canManage && outsiders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t bg-surface/60 px-5 py-3">
                <UserPlus className="size-4 text-muted-foreground" />
                <Select value={invitee} onValueChange={setInvitee}>
                  <SelectTrigger size="sm" className="w-56 text-xs" data-testid="invite-person">
                    <SelectValue placeholder="Add someone from the workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {outsiders.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.displayName} · {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={inviteRole} onValueChange={(r) => setInviteRole(r as ProjectRole)}>
                  <SelectTrigger size="sm" className="w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!invitee || setRole.isPending}
                  onClick={() => {
                    setRole.mutate({ user: invitee, role: inviteRole })
                    setInvitee('')
                  }}
                >
                  Add member
                </Button>
              </div>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <div className="flex items-center gap-2 border-b px-5 py-3">
              <ShieldCheck className="size-4 text-sensor" />
              <span className="font-semibold">Access matrix</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-1 py-2 font-medium">
                      <RoleBadge role={r} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(Object.keys(PROJECT_PERMISSIONS) as ProjectPermission[]).map((perm) => (
                  <tr key={perm}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{PERMISSION_LABEL[perm].label}</div>
                      <div className="text-[11px] text-muted-foreground">{PERMISSION_LABEL[perm].hint}</div>
                    </td>
                    {ROLES.map((r) => {
                      const on = (PROJECT_PERMISSIONS[perm] as readonly string[]).includes(r)
                      return (
                        <td key={r} className="text-center">
                          {on ? (
                            <Check className={cn('mx-auto size-4', r === project.myRole ? 'text-primary' : 'text-sensor')} />
                          ) : (
                            <span className="text-muted-foreground/30">·</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 border-t bg-surface/60 px-5 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <p>
                Workspace roles (engineer, safety, operator) set the kind of work someone does; project roles set where.
                Both must allow an action, and the server enforces it. The software e-stop stays available to anyone signed
                in, because safety outranks access control.
              </p>
            </div>
          </Panel>
        </div>
      </PageBody>
    </>
  )
}
