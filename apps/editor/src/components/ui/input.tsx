import * as React from "react"
import { cn } from "cn"
import { useEditable } from "@/components/editable"

function Input({ className, type, readOnly, ...props }: React.ComponentProps<"input">) {
  // In a read-only editor, fields show their value without looking editable.
  const ro = readOnly ?? !useEditable()
  return (
    <input
      type={type}
      readOnly={ro}
      data-readonly={ro || undefined}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-[readonly]:cursor-default data-[readonly]:border-transparent data-[readonly]:bg-transparent data-[readonly]:focus-visible:ring-0 dark:data-[readonly]:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Input }
