import type { DocKind, DocumentOf } from '@studio/schema'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Store, useSelector } from '@tanstack/react-store'
import { type Draft, produce } from 'immer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, api } from './api'
import { useCanEditDoc } from './project'
import { docQuery, qk } from './queries'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'error'

interface EditorState<T> {
  past: T[]
  present: T
  future: T[]
  version: number
  status: SaveStatus
  lastKey: string | null
  lastAt: number
}

const HISTORY_LIMIT = 200
const COALESCE_MS = 1200
const AUTOSAVE_MS = 700

/**
 * Draft editing for one document: undo/redo history (TanStack Store + immer),
 * debounced autosave with optimistic concurrency, and conflict recovery.
 * Rapid edits that share a coalesce key (slider drags, key drags) become one undo step.
 */
export function useDocEditor<K extends DocKind>(id: string, kind: K) {
  type T = DocumentOf<K>['draft']
  const qc = useQueryClient()
  const { data: doc } = useSuspenseQuery(docQuery(id))
  if (doc.kind !== kind) throw new Error(`${id} is a ${doc.kind}, expected ${kind}`)
  const [generation, setGeneration] = useState(0)
  // Read-only for anyone who may not edit: changes are ignored and nothing is saved.
  const canEdit = useCanEditDoc(doc)

  // biome-ignore lint/correctness/useExhaustiveDependencies: recreate only on reload (generation) or a different doc
  const store = useMemo(
    () =>
      new Store<EditorState<T>>({
        past: [],
        present: doc.draft as T,
        future: [],
        version: doc.draftVersion,
        status: 'saved',
        lastKey: null,
        lastAt: 0,
      }),
    [doc.id, generation],
  )

  const draft = useSelector(store, (s) => s.present)
  const status = useSelector(store, (s) => s.status)
  const canUndo = useSelector(store, (s) => s.past.length > 0)
  const canRedo = useSelector(store, (s) => s.future.length > 0)

  const update = useCallback(
    (recipe: (d: Draft<T>) => void, coalesceKey?: string) => {
      if (!canEdit) return
      store.setState((s) => {
        const next = produce(s.present, recipe) as T
        if (next === s.present) return s
        const now = Date.now()
        const coalesce = coalesceKey !== undefined && coalesceKey === s.lastKey && now - s.lastAt < COALESCE_MS
        return {
          ...s,
          past: coalesce ? s.past : [...s.past, s.present].slice(-HISTORY_LIMIT),
          present: next,
          future: [],
          status: s.status === 'conflict' ? 'conflict' : 'unsaved',
          lastKey: coalesceKey ?? null,
          lastAt: now,
        }
      })
    },
    [store, canEdit],
  )

  const undo = useCallback(() => {
    store.setState((s) => {
      const prev = s.past[s.past.length - 1]
      if (prev === undefined) return s
      return {
        ...s,
        past: s.past.slice(0, -1),
        present: prev,
        future: [s.present, ...s.future],
        status: 'unsaved',
        lastKey: null,
      }
    })
  }, [store])

  const redo = useCallback(() => {
    store.setState((s) => {
      const [next, ...rest] = s.future
      if (next === undefined) return s
      return { ...s, past: [...s.past, s.present], present: next, future: rest, status: 'unsaved', lastKey: null }
    })
  }, [store])

  const reload = useCallback(async () => {
    await qc.refetchQueries({ queryKey: qk.doc(id) })
    setGeneration((g) => g + 1)
  }, [qc, id])

  // ---- autosave ---------------------------------------------------------------------------
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = useCallback(async () => {
    const s = store.state
    if (s.status !== 'unsaved') return
    const sent = s.present
    store.setState((x) => ({ ...x, status: 'saving' }))
    try {
      const res = await api('saveDraft', {
        params: { id },
        body: { kind, draftVersion: s.version, draft: sent } as never,
      })
      store.setState((x) => ({ ...x, version: res.draftVersion, status: x.present === sent ? 'saved' : 'unsaved' }))
      qc.setQueryData(qk.doc(id), (old) => (old ? { ...old, ...res, draft: sent } : old))
      void qc.invalidateQueries({ queryKey: ['docs'] })
      if (store.state.status === 'unsaved') timer.current = setTimeout(save, AUTOSAVE_MS)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        store.setState((x) => ({ ...x, status: 'conflict' }))
        toast.error('Someone else saved this draft', {
          description: err.problem.detail,
          duration: Number.POSITIVE_INFINITY,
          action: { label: 'Reload', onClick: () => void reload() },
        })
      } else {
        store.setState((x) => ({ ...x, status: 'error' }))
        toast.error('Autosave failed', { description: err instanceof Error ? err.message : undefined })
      }
    }
  }, [store, id, kind, qc, reload])

  useEffect(() => {
    const sub = store.subscribe((s) => {
      if (s.status !== 'unsaved') return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(save, AUTOSAVE_MS)
    })
    return () => {
      sub.unsubscribe()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [store, save])

  // Flush on unmount / tab close so no edit is lost.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (store.state.status === 'unsaved' || store.state.status === 'saving') e.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      void save()
    }
  }, [store, save])

  // ---- keyboard ------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return {
    doc,
    canEdit,
    draft,
    version: useSelector(store, (s) => s.version),
    status,
    update,
    undo,
    redo,
    canUndo,
    canRedo,
    reload,
    flush: save,
  }
}

export type DocEditor<K extends DocKind> = ReturnType<typeof useDocEditor<K>>
