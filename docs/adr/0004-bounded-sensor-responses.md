# 4. Sensor responses are bounded clips, not scripts

Status: accepted

**Context.** Guest interaction makes shows non-deterministic. Arbitrary scripts cannot be statically verified for joint limits and speeds.

**Decision.** A response = trigger + window + cooldown + blend + a short clip. Blends start from any pose, so validation uses the worst case (`1.5 · max distance to either limit / blend ≤ maxVelocity`). Scheduling is deterministic and centralized in the local show controller (one arbiter; no overlap per device).

Responses can also be marked `standby`. After a show completes, they keep answering guests until an operator stops it. They start from home, which the worst-case blend check already covers. Standby is opt-in per response and visible in review, because it means unattended motion.

**Consequences.** Some creative behaviours (procedural, continuous tracking) need a future, separately-certified mechanism. Every possible path is provably within limits today — backed by a property-based test.
