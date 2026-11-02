import { z } from 'zod'
import './index.ts'
import { API_PREFIX, contract, type RouteDef } from './contract.ts'
import { DeviceToFleet, FleetToDevice } from './protocol.ts'

type Json = Record<string, unknown>
const COMPONENTS = '#/components/schemas/'

/** All registered schemas (those with `.meta({ id })`) as JSON Schema 2020-12 components. */
export function componentSchemas(): Record<string, Json> {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    target: 'draft-2020-12',
    unrepresentable: 'any',
    uri: (id) => `${COMPONENTS}${id}`,
  }) as { schemas: Record<string, Json> }
  const out: Record<string, Json> = {}
  for (const [id, schema] of Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))) {
    const { $schema: _s, $id: _i, ...rest } = schema
    out[id] = rest
  }
  return out
}

/** Reference a registered schema, or inline an anonymous one (rewriting its $defs to components). */
function schemaRef(schema: z.ZodType, io: 'input' | 'output' = 'output'): Json {
  const id = z.globalRegistry.get(schema)?.id
  if (id) return { $ref: `${COMPONENTS}${id}` }
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any', io }) as Json
  const { $schema: _s, $defs: _d, ...rest } = json
  return JSON.parse(JSON.stringify(rest).replaceAll('#/$defs/', COMPONENTS)) as Json
}

function parameters(route: RouteDef): Json[] {
  const params: Json[] = []
  const add = (where: 'path' | 'query', obj: z.ZodObject | undefined) => {
    if (!obj) return
    for (const [name, field] of Object.entries(obj.shape)) {
      const schema = field as z.ZodType
      params.push({
        name,
        in: where,
        required: where === 'path' || !schema.safeParse(undefined).success,
        schema: schemaRef(schema, 'input'),
      })
    }
  }
  add('path', route.params)
  add('query', route.query)
  return params
}

const security: Record<RouteDef['auth'], Json[]> = {
  public: [],
  user: [{ bearer: [] }],
  'user-or-device': [{ bearer: [] }, { device: [] }],
  provisioning: [{ provisioning: [] }],
}

export function buildOpenApi(version = '0.1.0'): Json {
  const paths: Record<string, Record<string, Json>> = {}
  for (const [operationId, route] of Object.entries(contract) as [string, RouteDef][]) {
    const path = API_PREFIX + route.path.replace(/:([A-Za-z0-9]+)/g, '{$1}')
    const status = String(route.status ?? 200)
    const success =
      route.response === 'binary'
        ? { description: 'File bytes', content: { 'application/octet-stream': {} } }
        : { description: 'OK', content: { 'application/json': { schema: schemaRef(route.response) } } }
    const op: Json = {
      operationId,
      summary: route.summary,
      tags: [route.tag],
      security: security[route.auth],
      parameters: parameters(route),
      responses: {
        [status]: success,
        default: {
          description: 'Problem details (RFC 9457)',
          content: { 'application/problem+json': { schema: { $ref: `${COMPONENTS}Problem` } } },
        },
      },
    }
    if (route.roles) op['x-roles'] = route.roles
    if (route.body === 'multipart') {
      op.requestBody = {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
          },
        },
      }
    } else if (route.body) {
      op.requestBody = { required: true, content: { 'application/json': { schema: schemaRef(route.body, 'input') } } }
    }
    paths[path] ??= {}
    paths[path][route.method.toLowerCase()] = op
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Show Studio API',
      version,
      description:
        'Studio (characters, environments, shows, revisions) and fleet manager (devices, deployments, launch). Generated from @studio/schema.',
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      schemas: componentSchemas(),
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer' },
        device: { type: 'apiKey', in: 'header', name: 'x-device-token' },
        provisioning: { type: 'apiKey', in: 'header', name: 'x-provisioning-token' },
      },
    },
  }
}

/** AsyncAPI 3 description of the device WebSocket protocol. */
export function buildAsyncApi(version = '0.1.0'): Json {
  const messages = (union: z.ZodDiscriminatedUnion) =>
    Object.fromEntries(
      union.options.map((option) => {
        const id = z.globalRegistry.get(option as z.ZodType)?.id ?? 'Unknown'
        return [id, { name: id, payload: { $ref: `${COMPONENTS}${id}` } }]
      }),
    )
  const up = messages(DeviceToFleet as unknown as z.ZodDiscriminatedUnion)
  const down = messages(FleetToDevice as unknown as z.ZodDiscriminatedUnion)
  const refs = (m: Json, channel: string) =>
    Object.keys(m).map((id) => ({ $ref: `#/channels/${channel}/messages/${id}` }))
  return {
    asyncapi: '3.0.0',
    info: {
      title: 'Show Studio device protocol',
      version,
      description:
        'JSON over WebSocket at /api/v1/devices/ws. Devices send hello first; commands carry opIds and are idempotent.',
    },
    channels: {
      deviceUp: { address: '/api/v1/devices/ws', messages: up },
      deviceDown: { address: '/api/v1/devices/ws', messages: down },
    },
    operations: {
      deviceSends: { action: 'receive', channel: { $ref: '#/channels/deviceUp' }, messages: refs(up, 'deviceUp') },
      fleetSends: { action: 'send', channel: { $ref: '#/channels/deviceDown' }, messages: refs(down, 'deviceDown') },
    },
    components: { schemas: componentSchemas() },
  }
}
