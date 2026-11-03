import {
  type CharacterDefinition,
  type DocKind,
  type DocRef,
  type EnvironmentDefinition,
  type RevisionDetail,
  refKey,
} from '@studio/schema'
import { queryOptions, useQueries, useQuery } from '@tanstack/react-query'
import { api } from './api'

export const qk = {
  docs: (kind?: DocKind, locationId?: string) => ['docs', kind ?? 'all', locationId ?? 'any'] as const,
  doc: (id: string) => ['doc', id] as const,
  revisions: (id: string) => ['revisions', id] as const,
  revision: (id: string, revision: number) => ['revision', id, revision] as const,
  assets: ['assets'] as const,
  devices: (environmentId?: string) => ['devices', environmentId ?? 'all'] as const,
  envStatus: (environmentId: string) => ['env-status', environmentId] as const,
  deployments: (environmentId?: string) => ['deployments', environmentId ?? 'all'] as const,
  audit: ['audit'] as const,
}

/** Documents you can read, optionally of one kind and/or at one location. */
export const docsQuery = (kind?: DocKind, locationId?: string) =>
  queryOptions({
    queryKey: qk.docs(kind, locationId),
    queryFn: () =>
      api('listDocuments', { query: { ...(kind ? { kind } : {}), ...(locationId ? { locationId } : {}) } }),
  })

export const docQuery = (id: string) =>
  queryOptions({
    queryKey: qk.doc(id),
    queryFn: () => api('getDocument', { params: { id } }),
    staleTime: Number.POSITIVE_INFINITY,
  })

export const revisionsQuery = (id: string) =>
  queryOptions({ queryKey: qk.revisions(id), queryFn: () => api('listRevisions', { params: { id } }) })

/** Revisions are immutable, so they never go stale. */
export const revisionQuery = (id: string, revision: number) =>
  queryOptions({
    queryKey: qk.revision(id, revision),
    queryFn: () => api('getRevision', { params: { id, revision } }),
    staleTime: Number.POSITIVE_INFINITY,
  })

export const assetsQuery = queryOptions({ queryKey: qk.assets, queryFn: () => api('listAssets') })

export const envStatusQuery = (environmentId: string) =>
  queryOptions({
    queryKey: qk.envStatus(environmentId),
    queryFn: () => api('environmentStatus', { params: { environmentId } }),
    refetchInterval: 1000,
  })

export const deploymentsQuery = (environmentId?: string) =>
  queryOptions({
    queryKey: qk.deployments(environmentId),
    queryFn: () => api('listDeployments', { query: environmentId ? { environmentId } : {} }),
    refetchInterval: 1500,
  })

export function useRevision<K extends DocKind>(ref: DocRef | null | undefined) {
  return useQuery({
    ...revisionQuery(ref?.id ?? '', ref?.revision ?? 1),
    enabled: !!ref,
    select: (r) => r as Extract<RevisionDetail, { kind: K }>,
  })
}

/** Resolve pinned character revisions for a set of placements. */
export function useCharacters(refs: readonly DocRef[]): {
  characters: Map<string, CharacterDefinition>
  loading: boolean
} {
  const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()]
  const results = useQueries({
    queries: unique.map((r) => ({ ...revisionQuery(r.id, r.revision), retry: false })),
  })
  const characters = new Map<string, CharacterDefinition>()
  results.forEach((res, i) => {
    const ref = unique[i]
    if (ref && res.data?.kind === 'character') characters.set(refKey(ref), res.data.content)
  })
  return { characters, loading: results.some((r) => r.isLoading) }
}

/** Environment revision + its characters (what a show needs to validate and preview). */
export function useShowContext(ref: DocRef | null | undefined) {
  const env = useRevision<'environment'>(ref)
  const environment: EnvironmentDefinition | undefined = env.data?.content
  const { characters, loading } = useCharacters(environment?.placements.map((p) => p.character) ?? [])
  return { environment, characters, loading: env.isLoading || loading, error: env.error }
}
