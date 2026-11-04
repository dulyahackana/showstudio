import type { Role } from '@studio/schema'
import { useMutation } from '@tanstack/react-query'
import { Clapperboard, Gauge, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Showcase } from '@/components/showcase'
import { api, problemMessage } from '@/lib/api'
import { signIn } from '@/lib/session'

export const PERSONAS: { name: string; roles: Role[]; title: string; blurb: string; icon: typeof UserRound }[] = [
  {
    name: 'alice',
    roles: ['engineer'],
    title: 'Alice · Show engineer',
    blurb: 'Uploads figures, builds environments, choreographs shows.',
    icon: Clapperboard,
  },
  {
    name: 'sam',
    roles: ['safety'],
    title: 'Sam · Safety reviewer',
    blurb: 'Reviews and signs show revisions (four-eyes rule).',
    icon: ShieldCheck,
  },
  {
    name: 'olga',
    roles: ['operator'],
    title: 'Olga · Park operator',
    blurb: 'Deploys approved shows, launches and swaps them.',
    icon: Gauge,
  },
  { name: 'admin', roles: ['admin'], title: 'Admin', blurb: 'Every permission. For setup and demos.', icon: UserRound },
]

export function usePersonaLogin() {
  return useMutation({
    mutationFn: (p: { name: string; roles: Role[] }) => api('devLogin', { body: { name: p.name, roles: p.roles } }),
    onSuccess: (res) => signIn(res.token, res.user),
    onError: (err) => toast.error(problemMessage(err).title, { description: problemMessage(err).detail }),
  })
}

const ROLE_TONE: Record<string, string> = {
  alice: 'text-motion bg-motion/10 border-motion/25',
  sam: 'text-audio bg-audio/10 border-audio/25',
  olga: 'text-sky-300 bg-sky-300/10 border-sky-300/25',
  admin: 'text-muted-foreground bg-muted border-border',
}

/** Development sign-in. Production uses OIDC single sign-on with the same roles. */
export function LoginScreen() {
  const login = usePersonaLogin()
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(420px,1fr)_1.4fr]">
      <div className="flex flex-col justify-between gap-10 p-8 lg:p-12">
        <div className="flex items-center gap-3">
          <img
            src="/favicon.svg"
            alt=""
            className="size-10 rounded-xl shadow-[0_0_32px_-4px_oklch(0.79_0.17_155/50%)]"
          />
          <div>
            <div className="text-lg font-semibold tracking-tight">Show Studio</div>
            <div className="text-xs text-muted-foreground">Cloud authoring for mechatronic attractions</div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md space-y-6">
          <div>
            <div className="text-eyebrow">Sign in</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Choose a persona</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each role sees what it is allowed to do.</p>
          </div>
          <div className="grid gap-2.5">
            {PERSONAS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => login.mutate(p)}
                disabled={login.isPending}
                data-testid={`login-${p.name}`}
                className="group flex items-center gap-4 rounded-xl border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-surface-2 disabled:opacity-60"
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${ROLE_TONE[p.name] ?? ''}`}
                >
                  <p.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.title}</span>
                  <span className="block text-sm text-muted-foreground">{p.blurb}</span>
                </span>
                <span className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary">
                  →
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Development login only. Production uses single sign-on; roles come from the identity provider.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Authored in the cloud · executed at the edge · safe by construction
        </p>
      </div>
      <div className="relative hidden overflow-hidden border-l bg-sidebar lg:block">
        <div className="bg-blueprint absolute inset-0" />
        <div className="absolute -top-40 -right-40 size-[520px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-[420px] rounded-full bg-motion/10 blur-3xl" />
        <div className="relative flex h-full flex-col items-center justify-center gap-6 px-10 py-8">
          <div className="w-full max-w-[min(100%,46rem,calc((100svh-22rem)*1.344))]">
            <div className="text-eyebrow">The studio for mechatronic shows</div>
            <h1 className="mt-1.5 text-2xl leading-tight font-semibold tracking-tight">
              From a figure's CAD model to a launched show.
            </h1>
          </div>
          <Showcase />
        </div>
      </div>
    </div>
  )
}
