import type { Issue } from '@studio/schema'
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'

export function IssuesList({ issues, onSelect }: { issues: Issue[]; onSelect?: (issue: Issue) => void }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-sensor">
        <CircleCheck className="size-4" /> No problems found. The same checks run on the server and on every device.
      </div>
    )
  }
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  return (
    <ScrollArea className="h-full">
      <ul className="divide-y" data-testid="issues">
        {sorted.map((issue, i) => {
          const Icon = issue.severity === 'error' ? CircleAlert : TriangleAlert
          return (
            <li key={`${issue.code}-${issue.path.join('.')}-${i}`}>
              <button
                type="button"
                onClick={() => onSelect?.(issue)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                <Icon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    issue.severity === 'error' ? 'text-danger' : 'text-warn',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block">{issue.message}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {issue.code}
                    {issue.t !== undefined && ` · ${formatMs(issue.t)}`}
                    {issue.behaviorId && ` · response ${issue.behaviorId}`}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </ScrollArea>
  )
}

export function IssueCounts({ issues }: { issues: Issue[] }) {
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.length - errors
  if (!issues.length) return <CircleCheck className="size-3.5 text-sensor" />
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {errors > 0 && (
        <span className="inline-flex items-center gap-0.5 text-danger">
          <CircleAlert className="size-3.5" />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="inline-flex items-center gap-0.5 text-warn">
          <TriangleAlert className="size-3.5" />
          {warnings}
        </span>
      )}
    </span>
  )
}
