# Contracts

There are three contracts, and all are generated from one place, [`packages/schema`](../packages/schema/src):

| Contract           | Source                                                                                                                                                                                                         | Published artifact                                                                                      | Consumers                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| REST API           | [`contract.ts`](../packages/schema/src/contract.ts) route table + [`api.ts`](../packages/schema/src/api.ts)                                                                                                    | [`contracts/openapi.json`](../contracts/openapi.json) (OpenAPI 3.1), served at `/api/v1/openapi.json`   | editor, seed, tests, 3rd parties                                   |
| Device protocol    | [`protocol.ts`](../packages/schema/src/protocol.ts)                                                                                                                                                            | [`contracts/asyncapi.json`](../contracts/asyncapi.json) (AsyncAPI 3), served at `/api/v1/asyncapi.json` | fleet gateway, simulated fleet, game-engine simulator, controllers |
| Documents & bundle | [`character.ts`](../packages/schema/src/character.ts), [`environment.ts`](../packages/schema/src/environment.ts), [`show.ts`](../packages/schema/src/show.ts), [`bundle.ts`](../packages/schema/src/bundle.ts) | [`contracts/json-schema/*.json`](../contracts/json-schema)                                              | everyone                                                           |
| Playback semantics | [`packages/playback`](../packages/playback/src)                                                                                                                                                                | [`test-vectors/`](../test-vectors) (`playback.json`, `signature.json`)                                  | every playback implementation                                      |

## How drift is prevented

1. **Server** routes are registered from the contract table ([`http.ts`](../apps/api/src/http.ts)): auth mode, roles, params/query/body parsing come from the contract, and **every response is validated against it** before it is sent. A handler cannot silently return something else.
2. **Editor** uses a typed client generated from the same table ([`lib/api.ts`](../apps/editor/src/lib/api.ts)); request/response types are inferred, and responses are validated at runtime too.
3. **Devices** parse every message with the zod unions (`DeviceToFleet`, `FleetToDevice`); the Godot simulator validates messages and bundles against the generated JSON Schema (`contracts/json-schema/ShowBundle.json` carries every component).
4. **CI** regenerates `contracts/` and `test-vectors/` and fails on any diff, so contract changes are always visible in review ([`schema.test.ts`](../packages/schema/src/schema.test.ts), [`ci.yml`](../.github/workflows/ci.yml)).
5. **Conformance**: the same vectors run in TypeScript (`conformance.test.ts`) and in Godot (`apps/godot-sim/tests/run_tests.gd`): sampling, audio cue timing, sensor arbitration, the device-side limit check and RSA signature interop. Preview, simulation and devices therefore agree.

## REST

Base path `/api/v1`. JSON in, JSON out; errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `application/problem+json`:

```json
{
  "type": "precondition-failed",
  "title": "Precondition failed",
  "status": 409,
  "detail": "The attraction is not ready for this show",
  "reasons": ["robot-01: controller runs robot@9, the show requires robot@1"]
}
```

| Status    | `type`                | When                                                                             |
| --------- | --------------------- | -------------------------------------------------------------------------------- |
| 400       | `bad-request`         | Body/params/query fail the schema (with `issues`)                                |
| 401       | `unauthorized`        | No/invalid session or device credential                                          |
| 403       | `forbidden`           | Role missing, or four-eyes rule (author reviewing own revision)                  |
| 404       | `not-found`           |                                                                                  |
| 409       | `conflict`            | Stale `draftVersion`, no changes, already reviewed, e-stop latched, show running |
| 409       | `precondition-failed` | Deploy/launch pre-check failed; `reasons[]` per device                           |
| 413 / 415 |                       | Upload too large / not a GLB or WAV/OGG/MP3 (checked by magic bytes)             |
| 422       | `validation-failed`   | Publish blocked by semantic errors; `issues[]` with device/joint/key/time        |

Authentication: `Authorization: Bearer <session>` (dev persona login now, OIDC later; same roles). Devices use `x-device-id`, `x-environment-id`, `x-device-token` (HMAC credential issued at provisioning). Provisioning uses `x-provisioning-token`.

Access has two layers. **Workspace roles** (from the contract's `roles`; admin implies all) say what kind of work a person does. **Project roles** (`owner`, `editor`, `reviewer`, `operator`, `viewer`; matrix in `PROJECT_PERMISSIONS`) say on which shows. A project is one show (same id): `POST /projects {id, draft}` creates both, and shows cannot be created any other way. Non-members get `404` for the project and its show. Library characters and location environments, with their live fleet state, are shared with the whole workspace, so only the workspace role applies to them. Routes: `GET /workspace`, `GET|POST /locations` (admins create), `GET|POST /projects`, `GET /projects/{id}`, `PUT|DELETE /projects/{id}/members/{user}` (owners and admins; a project keeps one owner). Characters are created with `POST /docs {kind: 'character'}`, environments with `POST /docs {kind: 'environment', locationId}`.

Workspace roles:

| Action                                       | engineer | safety | operator |
| -------------------------------------------- | :------: | :----: | :------: |
| Create/edit/publish documents, upload assets |    ✓     |        |          |
| Approve/reject show revisions (not your own) |          |   ✓    |          |
| Deploy approved shows                        |    ✓     |        |    ✓     |
| Launch (also needs project `operator`)       |          |        |    ✓     |
| Stop / reset e-stop on an environment        |          |        |    ✓     |
| E-stop (no project role needed)              |    ✓     |   ✓    |    ✓     |

The full route table with schemas is in `openapi.json`; the human-readable version is the `contract` object itself.

## Device protocol

JSON over WebSocket at `/api/v1/devices/ws`, one message per frame. Commands carry an `opId`; a repeated `opId` is a no-op, so the gateway can resend freely while reconciling.

```mermaid
sequenceDiagram
  participant D as Device (controller / sim)
  participant F as Fleet gateway
  participant A as Studio API
  Note over D: provisioned: deviceId, token, pinned definition, signing public key, attraction layout
  D->>F: hello {protocolVersion, deviceId, environmentId, kind, firmware, characterRef, token}
  F-->>D: welcome {serverTime, heartbeatMs}
  F-->>D: estop (only if the attraction's e-stop is latched)
  loop every heartbeatMs
    D->>F: status {state, staged[], active, fault}
    F-->>D: deploy / remove / stop (reconcile desired vs reported)
  end
  D->>A: GET /bundles/{sha256} (device credential)
  Note over D: verify sha256, RSA signature, schemaVersion, own payload, character ref,<br/>re-validate motion against its OWN limits, fetch+verify audio
  D->>F: status {staged: [{sha256, status: staged | rejected, reason}]}
  F-->>D: launch {sha256, startAt}
  Note over D: start at startAt (fleet clock, offset from welcome); play from local copy
  F-->>D: estop {reason} / reset
```

Close codes: `4001` hello timeout, `4002` hello required, `4003` protocol unsupported, `4004` unauthorized, `4005` replaced by newer connection (the replaced device stops reconnecting, so two fleets never fight over an identity).

**Provisioning** (`GET /fleet/provisioning/{environmentId}`, site token) returns, per attraction: device ids, kinds and credentials, the pinned character definitions (controllers keep their own limits from these), the signing public key, and the `layout`, which is the published `EnvironmentDefinition` that digital twins such as the Godot simulator build their scene from.

**Offline guarantees.** After `launch`, the cloud is out of the loop: devices play from their local copy, sensor responses are decided by the park-local show controller. Losing the fleet gateway mid-show does not stop the show (tested). A device that reconnects is brought back in line (latched e-stop re-sent; stopped runs stopped).

**Offline install package** (`GET /docs/{id}/revisions/{revision}/package`, people who may deploy the show). It is a zip for a controller the fleet manager cannot reach, or for the release archive. It holds:
- `bundle.json`: the exact signed bytes.
- `bundle.sig`: the signature.
- `audio/<sha256>.<ext>`: the speakers' files.
- `show.json`: the source definition.
- `manifest.json`: an index, [`PackageManifest`](../contracts/json-schema/PackageManifest.json).
- `README.txt`: how to check it by hand with `shasum` and `openssl`.

Only approved, signed revisions are packaged. The package is deterministic (the same revision always gives the same bytes), and every download is audited (`show.package`). The manifest is only an index: a controller still verifies the hash, the signature against its own pinned key, the schema, its limits and every audio hash, as for a network deploy. While connected, the fleet manager stays the source of truth.

**Revert** (`POST /docs/{id}/revisions/{revision}/restore`, editors). An earlier revision becomes the draft again, with optimistic concurrency on `draftVersion`, and is audited as `draft.restore`. Published revisions never change, so a revert is a new revision and goes through safety review. Rolling the attraction back without new work is just a deploy of an older approved revision.

## Bundle (what devices receive)

```jsonc
{
  "schemaVersion": 1,
  "show": { "id": "dragon-awakens", "revision": 3, "name": "The Dragon Awakens" },
  "environment": { "id": "dragons-lair", "revision": 1 },
  "durationMs": 45000,
  "behaviors": [
    {
      "id": "notice-guest",
      "trigger": { "sensorId": "door", "event": "enter" },
      "window": null,
      "blendMs": 2500,
      "cooldownMs": 8000,
      "durationMs": 2500,
      "devices": ["audio-02", "dragon-01", "light-01"]
    }
  ],
  "devices": {
    "dragon-01": {
      "kind": "doll",
      "character": {
        "ref": { "id": "dragon", "revision": 1 },
        "joints": [
          /* limits */
        ]
      },
      "motion": { "jaw_open": [{ "t": 13500, "v": 0, "interp": "linear" } /* … */] },
      "behaviorMotion": {
        "notice-guest": {
          /* clip */
        }
      }
    },
    "light-01": { "kind": "light", "dmx": { "universe": 0, "address": 1 }, "keys": [], "behaviorKeys": {} },
    "audio-02": {
      "kind": "audio",
      "maxVolumeDb": -6,
      "cues": [],
      "behaviorCues": {},
      "assets": { "<sha256>": { "path": "/api/v1/assets/<sha256>" } }
    },
    "door": { "kind": "sensor", "type": "presence", "range": 1.4 }
  }
}
```

The bytes are canonical JSON (sorted keys, no whitespace). The signature is RSA-SHA256 PKCS#1 v1.5 over those exact bytes; Bun/Node, .NET and Godot's `Crypto.verify` all support it, and `test-vectors/signature.json` proves it for every implementation.
