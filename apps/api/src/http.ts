import { API_PREFIX, type Contract, contract, type RouteDef, type RouteKey, type User } from '@studio/schema'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Config } from './config.ts'
import { problems } from './problems.ts'
import { verifyDeviceToken, verifySecret, verifySession } from './security.ts'

type Out<S> = S extends z.ZodType ? z.output<S> : undefined

export interface HandlerInput<K extends RouteKey> {
  params: Out<Contract[K] extends { params: infer P } ? P : undefined>
  query: Out<Contract[K] extends { query: infer Q } ? Q : undefined>
  body: Contract[K] extends { body: infer B } ? (B extends z.ZodType ? z.output<B> : undefined) : undefined
}

export interface RequestContext {
  user: User | null
  device: { environmentId: string; deviceId: string } | null
  req: FastifyRequest
  reply: FastifyReply
}

/** The authenticated user; only call from routes whose contract requires a user. */
export const actor = (ctx: RequestContext): User => {
  if (!ctx.user) throw problems.unauthorized()
  return ctx.user
}

type HandlerResult<K extends RouteKey> = Contract[K]['response'] extends z.ZodType
  ? z.input<Contract[K]['response']>
  : FastifyReply

const header = (req: FastifyRequest, name: string): string | undefined => {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

function authenticate(req: FastifyRequest, config: Config): Pick<RequestContext, 'user' | 'device'> {
  const bearer = header(req, 'authorization')?.match(/^Bearer (.+)$/)?.[1]
  // Query-string tokens let <audio>/<img>/GLTF loaders fetch assets; production would use signed URLs.
  const queryToken = (req.query as Record<string, unknown> | undefined)?.access_token
  const token = bearer ?? (typeof queryToken === 'string' ? queryToken : undefined)
  const user = token ? verifySession(config.AUTH_SECRET, token) : null

  const deviceId = header(req, 'x-device-id')
  const environmentId = header(req, 'x-environment-id')
  const deviceTok = header(req, 'x-device-token')
  const device =
    deviceId &&
    environmentId &&
    deviceTok &&
    verifyDeviceToken(config.DEVICE_SECRET, environmentId, deviceId, deviceTok)
      ? { deviceId, environmentId }
      : null
  return { user, device }
}

function parse<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw problems.badRequest(
      `Invalid ${what}: ${z.prettifyError(result.error)}`,
      result.error.issues.map((i) => ({
        severity: 'error' as const,
        code: `schema-${i.code}`,
        message: i.message,
        path: [what, ...i.path.map((p) => (typeof p === 'symbol' ? String(p) : p))],
      })),
    )
  }
  return result.data
}

/**
 * Bind a contract route to a handler. Authentication, role checks and request
 * parsing come from the contract; responses are validated against it too, so a
 * handler can never silently drift from the published API.
 */
export function registerRoute<K extends RouteKey>(
  app: FastifyInstance,
  config: Config,
  key: K,
  handler: (input: HandlerInput<K>, ctx: RequestContext) => Promise<HandlerResult<K>>,
): void {
  const def = contract[key] as RouteDef
  app.route({
    method: def.method,
    url: API_PREFIX + def.path,
    handler: async (req, reply) => {
      const { user, device } = authenticate(req, config)
      switch (def.auth) {
        case 'user':
          if (!user) throw problems.unauthorized()
          break
        case 'user-or-device':
          if (!user && !device) throw problems.unauthorized()
          break
        case 'provisioning': {
          const token = header(req, 'x-provisioning-token') ?? ''
          if (!verifySecret(token, config.PROVISIONING_TOKEN)) throw problems.unauthorized('Invalid provisioning token')
          break
        }
        case 'public':
          break
      }
      if (def.roles && user && !user.roles.includes('admin') && !def.roles.some((r) => user.roles.includes(r))) {
        throw problems.forbidden(`Requires role: ${def.roles.join(' or ')}`)
      }

      const input = {
        params: def.params ? parse(def.params, req.params, 'params') : undefined,
        query: def.query ? parse(def.query, req.query, 'query') : undefined,
        body: def.body && def.body !== 'multipart' ? parse(def.body, req.body, 'body') : undefined,
      } as HandlerInput<K>

      const result = await handler(input, { user, device, req, reply })
      if (def.response === 'binary') return result
      const checked = def.response.safeParse(result)
      if (!checked.success) {
        req.log.error({ route: key, issues: checked.error.issues }, 'response violates contract')
        throw new Error(`Response for ${key} violates the contract`)
      }
      return reply.status(def.status ?? 200).send(checked.data)
    },
  })
}
