import { z } from 'zod'

const DEV_SECRETS = ['AUTH_SECRET', 'DEVICE_SECRET', 'PROVISIONING_TOKEN'] as const

const Config = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().default(4000),
    DATA_DIR: z.string().default('./data'),
    /** postgres://… in production; unset = embedded PGlite under DATA_DIR (or in memory with ":memory:"). */
    DATABASE_URL: z.string().optional(),
    AUTH_SECRET: z.string().min(16).default('dev-auth-secret-change-me'),
    DEVICE_SECRET: z.string().min(16).default('dev-device-secret-change-me'),
    PROVISIONING_TOKEN: z.string().min(8).default('dev-provisioning-token'),
    /** PEM private key used to sign approved bundles; generated under DATA_DIR when unset. */
    SIGNING_KEY_PEM: z.string().optional(),
    /** Built editor to serve as a single-page app. */
    EDITOR_DIST: z.string().optional(),
    LAUNCH_LEAD_MS: z.coerce.number().int().min(500).default(3000),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(50),
    LOG_LEVEL: z.string().default('info'),
    /** Development persona login. Production deployments should use OIDC instead. */
    DEV_LOGIN: z.enum(['on', 'off']).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.NODE_ENV !== 'production') return
    for (const key of DEV_SECRETS) {
      if (c[key].startsWith('dev-'))
        ctx.addIssue({ code: 'custom', path: [key], message: 'must be set to a real secret in production' })
    }
  })
  .transform((c) => ({ ...c, DEV_LOGIN: c.DEV_LOGIN ?? (c.NODE_ENV === 'production' ? 'off' : 'on') }))

export type Config = z.output<typeof Config>

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Config.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}
