# 12. Operator consoles: stop locally, start through the fleet manager

Status: accepted

**Context.** An attraction needs controls on site: an operator who sees the zone starts the show, and anyone nearby can stop it. The studio's control room has Launch and E-STOP, but a stop that depends on the cloud is not a safety stop, and a start that skips the fleet manager skips its checks (every controller staged and verified, no latch, nothing running).

**Decision.** A console is a device of the attraction, placed in the layout (`consoles` in the `EnvironmentDefinition`), provisioned and connected like the figures. It has a display, NEXT (select a prepared show), RUN, RESET and a red mushroom E-STOP.

- **E-STOP** latches every controller over the park network first (the local bus, standing in for the hardwired stop circuit), then reports to the fleet manager, which records the latch and the audit entry with the console as the actor. A console that pressed while the cloud was unreachable reports it when it reconnects (`estopPressed` in its status).
- The mushroom **stays in** until it is twisted out. While any console reports it pushed in, the fleet manager refuses every reset, from the studio or a console.
- **RUN** and **RESET** go to the fleet manager, which applies the same checks as the studio (RUN launches the selected prepared show; the run's `launchedBy` is the console). A refusal comes back to the display. An accepted reset is relayed by the console over the park network too, so controllers cut off from the cloud clear as well.
- The display follows the attraction through `panel` messages (prepared shows, the current run, the latch), sent whenever they change.

**Consequences.** Physical presence is the authority at a console: there is no sign-in, as on real ride panels (a key switch would be the next step). Starting a show needs the fleet manager; stopping never does. The Godot twin renders the console and makes it clickable; the Node simulator implements the same logic for tests; `simulateConsole` presses buttons from the studio API for end-to-end runs.
