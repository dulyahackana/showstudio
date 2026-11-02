import type { ShowDefinition } from '@studio/schema'
import { useQuery } from '@tanstack/react-query'
import type { Draft } from 'immer'
import { NumberInput, Row } from '@/components/fields'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { revisionsQuery } from '@/lib/queries'

export function SettingsPanel({
  show,
  update,
}: {
  show: ShowDefinition
  update: (fn: (d: Draft<ShowDefinition>) => void, key?: string) => void
}) {
  const { data: envRevisions = [] } = useQuery(revisionsQuery(show.environment.id))
  return (
    <ScrollArea className="h-full">
      <div className="max-w-xl space-y-3 p-3">
        <Row label="Name">
          <Input
            className="h-7 text-xs"
            value={show.name}
            onChange={(e) =>
              update((d) => {
                d.name = e.target.value
              }, 'name')
            }
          />
        </Row>
        <Row label="Description">
          <Textarea
            className="text-xs"
            value={show.description}
            onChange={(e) =>
              update((d) => {
                d.description = e.target.value
              }, 'desc')
            }
          />
        </Row>
        <Row label="Duration (s)">
          <NumberInput
            step={1}
            min={1}
            value={show.durationMs / 1000}
            onChange={(v) =>
              update((d) => {
                d.durationMs = Math.round(Math.min(3600, Math.max(1, v)) * 1000)
              }, 'dur')
            }
          />
        </Row>
        <Row label="Environment" hint="Shows pin an environment revision; re-pin to pick up layout or fixture changes.">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{show.environment.id}</span>
            <Select
              value={String(show.environment.revision)}
              onValueChange={(r) =>
                update((d) => {
                  d.environment.revision = Number(r)
                })
              }
            >
              <SelectTrigger size="sm" className="w-24 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([show.environment.revision, ...envRevisions.map((r) => r.revision)])].map((r) => (
                  <SelectItem key={r} value={String(r)} className="font-mono">
                    r{r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Row>
      </div>
    </ScrollArea>
  )
}
