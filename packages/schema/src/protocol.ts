import { z } from 'zod'
import { DocRef, Id, Revision, Sha256 } from './common.ts'
import { SensorEvent } from './environment.ts'

/*
 * Fleet manager <-> device protocol (JSON over WebSocket, one message per frame).
 * Commands carry an `opId`; devices treat a repeated opId as a no-op, so the
 * fleet manager can resend freely while reconciling desired vs reported state.
 */

export const DeviceKind = z.enum(['doll', 'light', 'audio', 'sensor', 'console']).meta({ id: 'DeviceKind' })
export type DeviceKind = z.infer<typeof DeviceKind>

export const DeviceState = z.enum(['idle', 'ready', 'armed', 'running', 'standby', 'estopped', 'faulted']).meta({
  id: 'DeviceState',
  description:
    'idle: nothing staged; ready: >=1 show staged; armed: launch scheduled; running; standby: the last show completed and its standby responses still answer guests; estopped: latched until reset; faulted',
})
export type DeviceState = z.infer<typeof DeviceState>

export const StagedStatus = z.enum(['downloading', 'staged', 'rejected']).meta({ id: 'StagedStatus' })
export type StagedStatus = z.infer<typeof StagedStatus>

export const StagedShow = z
  .object({
    sha256: Sha256,
    showId: Id,
    revision: Revision,
    status: StagedStatus,
    reason: z.string().nullable(),
  })
  .meta({ id: 'StagedShow' })
export type StagedShow = z.infer<typeof StagedShow>

export const ActiveShow = z
  .object({ sha256: Sha256, startAt: z.number(), showTimeMs: z.number() })
  .meta({ id: 'ActiveShow' })
export type ActiveShow = z.infer<typeof ActiveShow>

// ---- device -> fleet -------------------------------------------------------

export const HelloMsg = z
  .object({
    type: z.literal('hello'),
    protocolVersion: z.number().int(),
    deviceId: Id,
    environmentId: Id,
    kind: DeviceKind,
    firmware: z.string(),
    characterRef: DocRef.nullable().describe('Definition loaded on the controller (figures only)'),
    token: z.string().describe('Device credential issued at provisioning'),
  })
  .meta({ id: 'HelloMsg' })
export type HelloMsg = z.infer<typeof HelloMsg>

export const StatusMsg = z
  .object({
    type: z.literal('status'),
    state: DeviceState,
    staged: z.array(StagedShow),
    active: ActiveShow.nullable(),
    fault: z.string().nullable(),
    estopPressed: z
      .boolean()
      .optional()
      .describe('Consoles only: the E-STOP mushroom is pushed in (it stays in until twisted out)'),
  })
  .meta({ id: 'StatusMsg' })
export type StatusMsg = z.infer<typeof StatusMsg>

export const AckMsg = z
  .object({
    type: z.literal('ack'),
    opId: z.string(),
    ok: z.boolean(),
    error: z.string().nullable(),
  })
  .meta({ id: 'AckMsg' })
export type AckMsg = z.infer<typeof AckMsg>

export const SensorEventMsg = z
  .object({ type: z.literal('sensorEvent'), sensorId: Id, event: SensorEvent, at: z.number() })
  .meta({ id: 'SensorEventMsg', description: 'Telemetry only: reactions are decided locally in the park' })
export type SensorEventMsg = z.infer<typeof SensorEventMsg>

export const ConsoleAction = z.enum(['run', 'estop', 'reset']).meta({ id: 'ConsoleAction' })
export type ConsoleAction = z.infer<typeof ConsoleAction>

export const ConsoleMsg = z
  .object({
    type: z.literal('console'),
    action: ConsoleAction,
    sha256: Sha256.nullable().describe('run: the prepared show selected on the panel'),
    at: z.number(),
  })
  .meta({
    id: 'ConsoleMsg',
    description:
      'An operator pressed a console button. estop has already latched the park locally; run and reset are decided by the fleet manager (refusals come back as an error message)',
  })
export type ConsoleMsg = z.infer<typeof ConsoleMsg>

export const DeviceToFleet = z
  .discriminatedUnion('type', [HelloMsg, StatusMsg, AckMsg, SensorEventMsg, ConsoleMsg])
  .meta({ id: 'DeviceToFleet' })
export type DeviceToFleet = z.infer<typeof DeviceToFleet>

// ---- fleet -> device -------------------------------------------------------

export const WelcomeMsg = z
  .object({
    type: z.literal('welcome'),
    serverTime: z.number().describe('Epoch ms; devices derive their clock offset from it'),
    heartbeatMs: z.number().int().positive(),
  })
  .meta({ id: 'WelcomeMsg' })

export const DeployMsg = z
  .object({
    type: z.literal('deploy'),
    opId: z.string(),
    showId: Id,
    revision: Revision,
    sha256: Sha256,
    url: z.string().describe('Path of the bundle, relative to the fleet manager base URL'),
    signature: z.string().describe('Base64 RSA-SHA256 (PKCS#1 v1.5) signature of the bundle bytes'),
  })
  .meta({ id: 'DeployMsg' })
export type DeployMsg = z.infer<typeof DeployMsg>

export const RemoveMsg = z
  .object({ type: z.literal('remove'), opId: z.string(), sha256: Sha256 })
  .meta({ id: 'RemoveMsg' })

export const LaunchMsg = z
  .object({
    type: z.literal('launch'),
    opId: z.string(),
    sha256: Sha256,
    startAt: z.number().describe('Epoch ms (fleet clock) at which every device starts'),
  })
  .meta({ id: 'LaunchMsg' })
export type LaunchMsg = z.infer<typeof LaunchMsg>

export const StopMsg = z.object({ type: z.literal('stop'), opId: z.string() }).meta({ id: 'StopMsg' })

export const EstopMsg = z
  .object({ type: z.literal('estop'), opId: z.string(), reason: z.string() })
  .meta({ id: 'EstopMsg' })

export const ResetMsg = z.object({ type: z.literal('reset'), opId: z.string() }).meta({ id: 'ResetMsg' })

export const SimulateSensorMsg = z
  .object({ type: z.literal('simulateSensor'), opId: z.string(), event: SensorEvent })
  .meta({ id: 'SimulateSensorMsg', description: 'Development only: stands in for a guest' })

export const PanelMsg = z
  .object({
    type: z.literal('panel'),
    prepared: z.array(
      z.object({ sha256: Sha256, showId: Id, revision: Revision, name: z.string(), goodToGo: z.boolean() }),
    ),
    run: z
      .object({ sha256: Sha256, name: z.string(), revision: Revision, startAt: z.number(), durationMs: z.number() })
      .nullable(),
    estop: z.object({ active: z.boolean(), by: z.string().nullable(), reason: z.string().nullable() }),
  })
  .meta({ id: 'PanelMsg', description: "What a console's display shows; resent whenever it changes" })
export type PanelMsg = z.infer<typeof PanelMsg>

export const ConsoleButton = z.enum(['run', 'estop', 'release', 'reset', 'select']).meta({ id: 'ConsoleButton' })
export type ConsoleButton = z.infer<typeof ConsoleButton>

export const SimulateConsoleMsg = z
  .object({ type: z.literal('simulateConsole'), opId: z.string(), button: ConsoleButton })
  .meta({ id: 'SimulateConsoleMsg', description: 'Development only: stands in for an operator at the panel' })

export const ErrorMsg = z
  .object({ type: z.literal('error'), code: z.string(), message: z.string() })
  .meta({ id: 'ErrorMsg' })

export const FleetToDevice = z
  .discriminatedUnion('type', [
    WelcomeMsg,
    DeployMsg,
    RemoveMsg,
    LaunchMsg,
    StopMsg,
    EstopMsg,
    ResetMsg,
    SimulateSensorMsg,
    PanelMsg,
    SimulateConsoleMsg,
    ErrorMsg,
  ])
  .meta({ id: 'FleetToDevice' })
export type FleetToDevice = z.infer<typeof FleetToDevice>
