import type { Role } from '@studio/schema'
import { useMutation } from '@tanstack/react-query'
import { Clapperboard, Gauge, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
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
  sam: 'text-sensor bg-sensor/10 border-sensor/25',
  olga: 'text-primary bg-primary/10 border-primary/25',
  admin: 'text-muted-foreground bg-muted border-border',
}

const PIPELINE = [
  ['Figures', 'GLB + joint limits'],
  ['Attractions', 'stage, lights, audio, sensors'],
  ['Shows', 'motion, light, sound, responses'],
  ['Review', 'four-eyes, signed'],
  ['Deploy', 'verified on every controller'],
  ['Launch', 'synchronized, e-stop ready'],
] as const

/** Development sign-in. Production uses OIDC single sign-on with the same roles. */
export function LoginScreen() {
  const login = usePersonaLogin()
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden border-r bg-sidebar lg:block">
        <div className="bg-blueprint absolute inset-0" />
        <div className="absolute -top-40 -left-40 size-[520px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-32 bottom-0 size-[420px] rounded-full bg-motion/10 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="size-10 rounded-xl shadow-[0_0_32px_-4px_oklch(0.8_0.155_72/50%)]" />
            <div>
              <div className="text-lg font-semibold tracking-tight">Show Studio</div>
              <div className="text-xs text-muted-foreground">Cloud authoring for mechatronic attractions</div>
            </div>
          </div>
          <div className="space-y-8">
            <h1 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">
              From a figure's CAD model to a launched show.
            </h1>
            <ol className="grid max-w-md gap-2.5">
              {PIPELINE.map(([title, sub], i) => (
                <li key={title} className="flex items-center gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-[11px] text-primary">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-medium">{title}</span>
                    <span className="text-muted-foreground"> · {sub}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-muted-foreground">Authored in the cloud · executed at the edge · safe by construction</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
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
                <span className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary">→</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Development login only. Production uses single sign-on; roles come from the identity provider.
          </p>
        </div>
      </div>
    </div>
  )
}
