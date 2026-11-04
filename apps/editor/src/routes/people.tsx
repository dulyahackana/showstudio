import { PROJECT_PERMISSIONS, type ProjectPermission, ProjectRole } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Bot, Check, Clapperboard, MapPin, OctagonX } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageBody, PageHeader, Panel, Section } from '@/components/page'
import { RoleBadge } from '@/components/project-ui'
import { useProjects, workspaceQuery } from '@/lib/project'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/people')({ component: PeoplePage })

const ROLES = ProjectRole.options

const PERMISSION_LABEL: Record<ProjectPermission, string> = {
  read: 'See the project',
  edit: 'Animate & publish',
  review: 'Safety review',
  operate: 'Deploy & launch',
  manage: 'Manage the team',
}

/** Who is in the workspace, which projects they are on, and how access works. */
function PeoplePage() {
  const { data: workspace } = useQuery(workspaceQuery)
  const { data: projects = [] } = useProjects()
  return (
    <>
      <PageHeader
        eyebrow={`Admin · ${workspace?.name ?? ''}`}
        title="People & access"
        description="Workspace roles say what someone does; project teams say where."
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-3">
          <Rule icon={Bot} title="Library" scope="Whole workspace">
            Characters and assets. Everyone can use them; engineers edit them.
          </Rule>
          <Rule icon={MapPin} title="Locations" scope="Whole workspace">
            Environments and their live state. Engineers edit layouts, operators stop and reset. Anyone signed in can
            press{' '}
            <span className="whitespace-nowrap">
              <OctagonX className="inline size-3.5 text-danger" /> e-stop
            </span>
            .
          </Rule>
          <Rule icon={Clapperboard} title="Projects" scope="Members only">
            One show each. Non-members do not see it at all. The project role decides who animates, reviews and runs it.
          </Rule>
        </div>

        <Section title="Who is on which project" description="Only projects you can see are listed.">
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Person</th>
                  <th className="px-3 py-2.5 font-medium">Workspace role</th>
                  {projects.map((p) => (
                    <th key={p.id} className="px-3 py-2.5 font-medium">
                      <Link
                        to="/projects/$projectId/team"
                        params={{ projectId: p.id }}
                        className="hover:text-foreground"
                      >
                        {p.name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {workspace?.directory.map((person) => (
                  <tr key={person.name} data-testid={`person-${person.name}`}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{person.displayName}</div>
                      <div className="text-[11px] text-muted-foreground">{person.title}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{person.role}</td>
                    {projects.map((p) => {
                      const m = p.members.find((x) => x.user === person.name)
                      return (
                        <td key={p.id} className="px-3 py-2.5">
                          {m ? <RoleBadge role={m.role} /> : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>

        <Section title="Project roles" description="What each role allows inside a project.">
          <Panel className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[11px] text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-2 py-2 font-medium">
                      <RoleBadge role={r} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(Object.keys(PROJECT_PERMISSIONS) as ProjectPermission[]).map((perm) => (
                  <tr key={perm}>
                    <td className="px-5 py-2.5 font-medium">{PERMISSION_LABEL[perm]}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="text-center">
                        {(PROJECT_PERMISSIONS[perm] as readonly string[]).includes(r) ? (
                          <Check className="mx-auto size-4 text-ok" />
                        ) : (
                          <span className="text-muted-foreground/30">·</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>
      </PageBody>
    </>
  )
}

function Rule({
  icon: Icon,
  title,
  scope,
  children,
}: {
  icon: typeof Bot
  title: string
  scope: string
  children: ReactNode
}) {
  return (
    <Panel className="space-y-2 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg border bg-surface-2">
          <Icon className="size-4 text-primary" />
        </span>
        <span className="font-semibold">{title}</span>
        <span
          className={cn(
            'ml-auto rounded-full border px-2 py-px text-[10px]',
            scope === 'Members only' ? 'border-primary/30 text-primary' : 'text-muted-foreground',
          )}
        >
          {scope}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{children}</p>
    </Panel>
  )
}
