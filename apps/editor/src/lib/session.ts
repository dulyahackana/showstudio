import { contract, type RouteDef, type RouteKey, type User } from '@studio/schema'
import { Store, useSelector } from '@tanstack/react-store'

interface Session {
  token: string | null
  user: User | null
}

const KEY = 'studio.session'

function load(): Session {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Session
  } catch {
    /* storage unavailable: start signed out */
  }
  return { token: null, user: null }
}

export const sessionStore = new Store<Session>(load())

sessionStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
})

export const signIn = (token: string, user: User) => sessionStore.setState(() => ({ token, user }))
export const signOut = () => sessionStore.setState(() => ({ token: null, user: null }))
export const useSession = () => useSelector(sessionStore, (s) => s)
export const useUser = () => useSelector(sessionStore, (s) => s.user)

/** Mirrors the server's role check, read straight from the shared contract. */
export function canCall(user: User | null, key: RouteKey): boolean {
  if (!user) return false
  const roles = (contract[key] as RouteDef).roles
  return !roles || user.roles.includes('admin') || roles.some((r) => user.roles.includes(r))
}

export function useCan(key: RouteKey): boolean {
  return canCall(useUser(), key)
}
