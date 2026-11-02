# 6. Postgres dialect everywhere (PGlite in dev/test)

Status: accepted

**Context.** We want production-grade persistence without making local development and tests depend on Docker.

**Decision.** One SQL dialect (Postgres). Dev and tests use PGlite (Postgres compiled to WASM, in-process, in-memory for tests); docker-compose and production use Postgres via `DATABASE_URL`. A tiny `Db` port hides the difference. Forward-only migrations.

**Consequences.** No ORM; queries are explicit SQL in services. PGlite is single-connection, which is fine for dev but not a production option.
