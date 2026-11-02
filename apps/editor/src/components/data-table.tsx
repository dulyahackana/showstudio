import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** Generic sortable table (TanStack Table + shadcn Table). */
export function DataTable<T>({
  data,
  columns,
  empty = 'Nothing here yet.',
  onRowClick,
  rowId,
  selectedId,
  className,
}: {
  data: T[]
  // biome-ignore lint/suspicious/noExplicitAny: column value types vary per column
  columns: ColumnDef<T, any>[]
  empty?: ReactNode
  onRowClick?: (row: T) => void
  rowId?: (row: T) => string
  selectedId?: string | null
  className?: string
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(rowId ? { getRowId: rowId } : {}),
  })

  return (
    <div className={cn('overflow-hidden rounded-lg border', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    className={cn(header.column.getCanSort() && 'cursor-pointer select-none')}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === 'asc' && <ArrowUp className="size-3" />}
                      {sorted === 'desc' && <ArrowDown className="size-3" />}
                    </span>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-20 text-center text-sm text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={selectedId === row.id ? 'selected' : undefined}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
