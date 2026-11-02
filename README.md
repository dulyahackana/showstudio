# Show Studio

A cloud-native animation studio for mechatronic shows. Engineers upload figures and refine their joint limits, describe each attraction, and choreograph motion, light and sound with responses to sensors. Approved shows are signed and deployed to every controller in the attraction, verified, and launched by an operator.

- **Web editor** (`apps/editor`): React 19, TanStack Router/Query/Table/Form/Store, shadcn/ui (Radix), react-three-fiber.
- **Studio API + fleet manager** (`apps/api`): Fastify, Postgres (PGlite in dev), device WebSocket gateway.
- **Simulated attraction** (`apps/fleet-sim`): headless reference implementation of the device protocol, used by the tests.
- **Godot simulator** (`apps/godot-sim`): the attraction as a game-engine twin. Each device has its own connection, the stage is built from the layout, and you can walk a guest through the sensor zones. The studio deploys to it exactly as it would to a park ([docs/engine-integration.md](docs/engine-integration.md)).
- **Contract** (`packages/schema`) and **playback** (`packages/playback`): one source of truth for data, API, protocol and show semantics.

Toolchain: [Bun](https://bun.sh) ≥ 1.4.4 is the package manager, runtime, test runner and bundler, and [Godot](https://godotengine.org) 4.7 runs the simulator.

## Quick start

```bash
bun install
bun run dev           # API :4000 + editor :5173
bun run seed          # in another terminal: dragon + robot, Dragon's Lair, two approved shows
bun run sim:godot     # the attraction in Godot (9 controllers); or `bun run fleet-sim` for the headless one
open http://localhost:5173
```

Bun older than 1.4 aborts about 10 s after the embedded Postgres starts. The API refuses to start on it and tells you to run `bun upgrade`. Godot is found via `$GODOT`, `godot` on `PATH`, or `/Applications/Godot.app` (`brew install --cask godot`).

Or, production-shaped with Postgres: `docker compose up --build` → http://localhost:4000.

### Demo path (maps to the brief)

| Step in the brief                                        | Where                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Upload 3D models and definitions                         | **Characters → New character** (GLB + URDF/JSON; samples in `samples/`)                                         |
| Refine definitions (range of motion)                     | Character editor: joints table, limits, speeds, "sweep at max speed" preview                                    |
| Environmental specifications                             | **Environments**: stage boundary, keep-out zones, lighting fixtures + palette, audio ceilings, sensors          |
| Motion, sound, light patterns and sensor responses       | **Shows**: multi-track timeline, auto-key posing, live validation, **Sensor responses** tab, "Simulate guest"   |
| Upload to dolls, lighting, sound, sensing → "good to go" | **Fleet & deploy**: approved + signed revision → every device verifies and stages → _good to go_                |
| Operator "launch", multiple shows, swap                  | **Operator console**: zone-clear confirmation, synchronized start, swap, e-stop                                 |
| See it play                                              | **Godot window**: figures, lights and speakers follow the controllers; walk the guest (WASD) into a sensor zone |

Personas: Alice (engineer), Sam (safety reviewer: four-eyes approval), Olga (operator), Admin.

## Repository

```
packages/schema     data model, REST contract, device protocol (zod) → contracts/*.json
packages/playback   interpolation, validation, bundle compiler, deterministic runtime
apps/api            studio API + fleet manager (Fastify, Postgres/PGlite)
apps/editor         web studio (Vite, React, TanStack, shadcn, three.js)
apps/fleet-sim      headless simulated attraction (device protocol reference)
apps/godot-sim      Godot 4 simulator: the attraction as a game-engine twin
contracts/          generated OpenAPI, AsyncAPI, JSON Schemas (committed, CI-checked)
test-vectors/       conformance vectors (playback, scheduler, device checks, signatures) for every implementation
samples/            sample GLB models, URDFs, audio (bun run gen:samples)
scripts/            seed, sample generator, e2e stacks, Godot launcher
docs/               architecture, data model, contracts, engine integration, ADRs
```

## Quality gates

```bash
bun run lint          # Biome
bun run typecheck     # strict TS across all packages
bun run test          # unit, property-based, conformance, contract, API end-to-end with simulated devices
bun run e2e           # Playwright UI flow against a fresh stack (deploy → launch → sensor → e-stop)
bun run test:godot    # the Godot port reproduces every conformance vector
bun run e2e:godot     # Godot as the attraction: deploy → good to go → launch → sensor → e-stop
bun run gen:contracts && bun run gen:vectors   # regenerate published contracts / vectors
```

## Documentation

- [Architecture](docs/architecture.md): components, flows, assumptions, scaling
- [Data model](docs/data-model.md): entities, units, versioning, persistence, state machines
- [Contracts](docs/contract.md): REST, device protocol, bundle, drift prevention
- [Godot simulator](docs/engine-integration.md): how the game-engine twin joins the fleet and how we know it matches
- [Production readiness](PRODUCTION_READINESS.md): built / stubbed / gaps with mitigations
- [Decision records](docs/adr)
