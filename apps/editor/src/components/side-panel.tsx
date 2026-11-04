import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type PanelSize, usePanelRef } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * A right-hand editor panel that collapses like the app sidebar: from a toolbar button,
 * or by dragging its divider all the way. Remembered per editor in this browser.
 */
export function useSidePanel(key: string) {
  const panelRef = usePanelRef()
  const storageKey = `studio.panel.${key}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'collapsed'
    } catch {
      return false
    }
  })
  const [startCollapsed] = useState(collapsed)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, collapsed ? 'collapsed' : 'open')
    } catch {
      /* storage unavailable: the panel just opens next time */
    }
  }, [storageKey, collapsed])

  return {
    collapsed,
    toggle: () => {
      const panel = panelRef.current
      if (!panel) return
      if (panel.isCollapsed()) panel.expand()
      else panel.collapse()
    },
    /** Spread on the ResizablePanel; `size` is its open default. */
    panelProps: (size: string) => ({
      panelRef,
      collapsible: true,
      collapsedSize: '0%',
      defaultSize: startCollapsed ? '0%' : size,
      onResize: (s: PanelSize) => setCollapsed(s.inPixels < 1),
    }),
  }
}

export function SidePanelToggle({ panel, label }: { panel: ReturnType<typeof useSidePanel>; label: string }) {
  const Icon = panel.collapsed ? PanelRightOpen : PanelRightClose
  const text = `${panel.collapsed ? 'Show' : 'Hide'} ${label}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant="ghost" onClick={panel.toggle} aria-label={text} data-testid="toggle-side-panel">
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}
