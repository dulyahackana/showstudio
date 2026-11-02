# 8. Bun as package manager, runtime, test runner and bundler

Status: accepted

**Context.** The TypeScript monorepo used npm, tsx, esbuild, Vitest and concurrently: five tools to install, configure and keep in step.

**Decision.** Use Bun for all of it: `bun install` (workspaces, `bun.lock`), running TypeScript directly (`bun src/server.ts`, `bun --watch`), `bun test` (Jest-compatible; the existing suites moved by changing one import), `bun build` for the API bundle, `bun run --filter` for workspace scripts, and the `oven/bun` image in Docker and `setup-bun` in CI. The version is pinned in `packageManager`, which CI reads.

**Consequences.** One tool, faster installs and tests (full suite ≈ 3 s). The API still uses only Node APIs (`node:crypto`, `node:fs`, Fastify), so moving back to Node would be a tooling change, not a code change. A Bun bug surfaced right away: Bun 1.3 aborts about 10 s after PGlite starts. We pinned Bun ≥ 1.4.4, and the API now refuses older versions with a clear message instead of crashing. Vite and Playwright run under Bun too (`bunx --bun vite`).
