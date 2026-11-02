# 3. The cloud is never in the real-time loop

Status: accepted

**Context.** The platform is cloud-native, but a network outage must never stop or corrupt a show in front of guests.

**Decision.** Devices stage complete bundles locally and start at a synchronized `startAt`. Sensor reactions are arbitrated by a park-local show controller. The fleet gateway reconciles desired vs reported state when connections return (deploys, removals, latched e-stop, missed stops).

**Consequences.** Devices need storage and a clock; time sync (PTP/SMPTE) is required on site. Live "remote control" of figures is deliberately not offered.
