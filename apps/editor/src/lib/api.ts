import {
  API_PREFIX,
  buildPath,
  contract,
  type Problem,
  type RouteDef,
  type RouteInput,
  type RouteKey,
  type RouteOutput,
} from '@studio/schema'
import { sessionStore, signOut } from './session'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail ?? problem.title)
  }
}

type Input = { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }

/**
 * Typed client generated from the shared contract: paths, methods, request and
 * response types all come from @studio/schema, and responses are validated at
 * runtime so contract drift fails loudly instead of corrupting the UI.
 */
export async function api<K extends RouteKey>(key: K, input?: RouteInput<K>): Promise<RouteOutput<K>> {
  const def = contract[key] as RouteDef
  const { params, query, body } = (input ?? {}) as Input
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) search.set(k, String(v))
  const qs = search.size ? `?${search}` : ''

  const headers: Record<string, string> = {}
  const token = sessionStore.state.token
  if (token) headers.authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`${API_PREFIX}${buildPath(def.path, params)}${qs}`, {
    method: def.method,
    headers,
    body: payload,
  })
  if (!res.ok) {
    const problem: Problem = await res
      .json()
      .catch(() => ({ type: 'network', title: res.statusText || 'Request failed', status: res.status }))
    if (res.status === 401 && def.auth !== 'public') signOut()
    throw new ApiError(res.status, problem)
  }
  if (def.response === 'binary') return (await res.blob()) as RouteOutput<K>
  const json: unknown = await res.json()
  const parsed = def.response.safeParse(json)
  if (!parsed.success) {
    console.error(`Response for ${key} violates the contract`, parsed.error.issues)
    throw new ApiError(500, { type: 'contract', title: 'Unexpected response from server', status: 500 })
  }
  return parsed.data as RouteOutput<K>
}

/** URL usable by <audio>, loaders, etc. (token in the query string; production: signed URLs). */
export const assetUrl = (id: string) =>
  `${API_PREFIX}/assets/${id}?access_token=${encodeURIComponent(sessionStore.state.token ?? '')}`

export function problemMessage(err: unknown): { title: string; detail?: string; reasons?: string[] } {
  if (err instanceof ApiError) {
    return {
      title: err.problem.title,
      ...(err.problem.detail ? { detail: err.problem.detail } : {}),
      ...(err.problem.reasons ? { reasons: err.problem.reasons } : {}),
    }
  }
  return { title: err instanceof Error ? err.message : 'Something went wrong' }
}
