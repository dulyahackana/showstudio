# 1. Contract-first with zod as the single source of truth

Status: accepted

**Context.** Four parties must agree on data: the editor, the API, cloud-side devices (simulator) and real controllers written in other languages. Hand-maintained OpenAPI or duplicated types drift.

**Decision.** Define every document, request, response and protocol message once as a zod schema in `packages/schema`. Derive TypeScript types, the server's route registration (auth, roles, parsing, response validation), the editor's typed client, and generated OpenAPI 3.1 / AsyncAPI 3 / JSON Schema artifacts for non-TS consumers. CI fails if generated artifacts are stale.

**Consequences.** A contract change is a single, reviewable diff with visible artifact changes. Runtime validation costs a little CPU per request. Non-TS teams consume JSON Schema rather than zod.
