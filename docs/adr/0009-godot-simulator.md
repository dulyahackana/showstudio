# 9. Godot as the game-engine simulator, as a fleet rather than a viewer

Status: accepted

**Context.** Engineers and operators want to watch a show play on the attraction before it reaches the park. A viewer that reads show files would bypass deployment, verification and launch, which are the parts that most need rehearsal.

**Decision.** The simulator is another attraction. It provisions with the site token, runs one controller per device with its own connection and credential, and verifies bundles like hardware (hash, signature, JSON Schema, its own limits). It plays from local copies and arbitrates sensors locally. We chose Godot 4: it loads GLB at runtime and has WebSocket, HTTP, SHA-256 and RSA verification built in, so it needs no add-ons. It is open source (MIT), runs headless in CI, and GDScript is close enough to the TypeScript runtime to port line by line.

**Consequences.** The studio cannot tell the simulator from a park, so every deploy and launch path gets rehearsed. Drift between the TypeScript and GDScript runtimes is caught by shared conformance vectors and a Godot end-to-end in CI. Provisioning now also returns the attraction `layout`, so twins can build the scene. The engine renders keyframes; it is not a dynamics or collision model (see PRODUCTION_READINESS).
