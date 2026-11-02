import type { Issue } from '@studio/schema'
import { Link } from '@tanstack/react-router'
import { Bot, ChevronRight, Clapperboard, Eye, Mountain, Redo2, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { DocStatus } from '@/components/doc-cards'
import { useDocPermission } from '@/lib/project'
import { IssueCounts } from '@/components/issues-list'
import { PublishDialog } from '@/components/publish-dialog'
import { SaveIndicator } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DocEditor } from '@/lib/doc-editor'

export function EditorToolbar({
  editor,
  issues,
  title,
  subtitle,
  requiresReview = false,
  children,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: shared across document kinds
  editor: DocEditor<any>
  issues: Issue[]
  title: ReactNode
  subtitle?: ReactNode
  requiresReview?: boolean
  children?: ReactNode
}) {
  const list = LIST[editor.doc.kind as keyof typeof LIST]
  const canEdit = useDocPermission(editor.doc.projectId, 'edit')
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface/60 px-4">
      <Link
        to={list.to}
        className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <list.icon className="size-4" /> {list.label}
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-base font-semibold tracking-tight" data-testid="doc-title">
          {title}
        </h1>
        {subtitle && <span className="hidden truncate text-xs text-muted-foreground xl:inline">{subtitle}</span>}
      </div>
      <DocStatus doc={editor.doc} reviewed={requiresReview} />
      {!canEdit && (
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
          <Eye className="size-3" /> View only
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {children}
        <IssueCounts issues={issues} />
        <SaveIndicator status={editor.status} />
        <div className="flex items-center rounded-md border bg-surface-2/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={editor.undo} disabled={!editor.canUndo} aria-label="Undo">
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Undo <Kbd>⌘Z</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={editor.redo} disabled={!editor.canRedo} aria-label="Redo">
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Redo <Kbd>⇧⌘Z</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
        <PublishDialog
          projectId={editor.doc.projectId}
          docId={editor.doc.id}
          draftVersion={editor.version}
          issues={issues}
          flush={editor.flush}
          requiresReview={requiresReview}
        />
      </div>
    </div>
  )
}

const LIST = {
  character: { to: '/characters', label: 'Characters', icon: Bot },
  environment: { to: '/environments', label: 'Environments', icon: Mountain },
  show: { to: '/shows', label: 'Shows', icon: Clapperboard },
} as const
