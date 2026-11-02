# 5. One validator, run in editor, API and device

Status: accepted

**Context.** Client-side validation is for feedback, not safety; server-side validation can be bypassed by a compromised server; devices must not trust either.

**Decision.** `packages/playback/validate.ts` runs live in the editor, as the publish gate in the API, and on each figure controller against limits it holds itself (`validateDollPayload`). Hardware limits and the e-stop circuit remain independent of software.

**Consequences.** The validator is safety-relevant code: high test coverage, property tests, conformance vectors, and change review by the safety owner.
