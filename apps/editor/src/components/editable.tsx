import { type ComponentProps, createContext, type ReactNode, useContext } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Whether the surrounding editor may change its document. Inputs, selects, switches and
 * sliders read it and render as plain values when false; edit-only buttons sit in
 * <EditOnly>, so people only see the actions they can take.
 */
export const EditableContext = createContext(true)

export const useEditable = () => useContext(EditableContext)

export function EditOnly({ children }: { children: ReactNode }) {
  return useEditable() ? children : null
}

/** A button for an edit action (add, delete, import): not rendered in read-only editors. */
export function EditButton(props: ComponentProps<typeof Button>) {
  return useEditable() ? <Button {...props} /> : null
}
