# 7. Studio API and fleet manager ship as one deployable (for now)

Status: accepted

**Context.** A small team, early product. The studio (authoring) and fleet (operations) have different scaling and availability profiles long-term.

**Decision.** Keep them as separate services in code (`services/studio.ts`, `services/fleet.ts`) sharing one process and database. Split along that seam when device counts grow (sharded gateways, MQTT broker) or when operations need a separate SLA.

**Consequences.** Simple to run and demo; the split is a deployment change, not a rewrite.
