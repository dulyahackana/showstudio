import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { docsQuery } from '@/lib/queries'

export function EnvironmentPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const { data: envs = [] } = useQuery(docsQuery('environment'))
  const published = envs.filter((e) => e.latestRevision)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-64" data-testid="environment-picker">
        <SelectValue placeholder="Choose an attraction" />
      </SelectTrigger>
      <SelectContent>
        {published.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
