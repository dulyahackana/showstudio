import type { Issue } from '@studio/schema'
import { Link } from '@tanstack/react-router'
import { Bot, ChevronRight, Clapperboard, Eye, Mountain, Redo2, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { DocStatus } from '@/components/doc-cards'
import { IssueCounts } from '@/components/issues-list'
import { PublishDialog } from '@/components/publish-dialog'
import { SaveIndicator } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DocEditor } from '@/lib/doc-editor'
import { cn } from '@/lib/utils'

export function EditorToolbar({
  editor,
  issues,
  title,
  subtitle,
  requiresReview = false,
  embedded = false,
  end,
  children,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: shared across document kinds
  editor: DocEditor<any>
  issues: Issue[]
  title?: ReactNode
  subtitle?: ReactNode
  requiresReview?: boolean
  /** Inside a project or environment page, whose header already names the document. */
  embedded?: boolean
  /** Far right, above the editor's side panel (its collapse toggle). */
  end?: ReactNode
  children?: ReactNode
}) {
  const list = LIST[editor.doc.kind as keyof typeof LIST]
  const canEdit = editor.canEdit
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-3 border-b px-4',
        embedded ? 'h-11 bg-surface/30' : 'h-14 bg-surface/60',
      )}
    >
      {!embedded && (
        <>
          <Link
            to={list.to}
            className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <list.icon className="size-4" /> {list.label}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
          <h1 className="truncate text-base font-semibold tracking-tight" data-testid="doc-title">
            {title}
          </h1>
        </>
      )}
      {subtitle && <span className="hidden min-w-0 truncate text-xs text-muted-foreground xl:inline">{subtitle}</span>}
      <DocStatus doc={editor.doc} reviewed={requiresReview} />
      {!canEdit && (
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
          data-testid="view-only"
        >
          <Eye className="size-3" /> View only
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {children}
        <IssueCounts issues={issues} />
        {canEdit && <SaveIndicator status={editor.status} />}
        {canEdit && (
          <div className="flex items-center rounded-md border bg-surface-2/50">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={editor.undo}
                  disabled={!editor.canUndo}
                  aria-label="Undo"
                >
                  <Undo2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Undo <Kbd>⌘Z</Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={editor.redo}
                  disabled={!editor.canRedo}
                  aria-label="Redo"
                >
                  <Redo2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Redo <Kbd>⇧⌘Z</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        {canEdit && (
          <PublishDialog
            projectId={editor.doc.projectId}
            docId={editor.doc.id}
            draftVersion={editor.version}
            issues={issues}
            flush={editor.flush}
            requiresReview={requiresReview}
          />
        )}
        {end}
      </div>
    </div>
  )
}

const LIST = {
  character: { to: '/characters', label: 'Library · Characters', icon: Bot },
  environment: { to: '/locations', label: 'Locations', icon: Mountain },
  show: { to: '/projects', label: 'Projects', icon: Clapperboard },
} as const
