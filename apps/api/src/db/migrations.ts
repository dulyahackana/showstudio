/**
 * Forward-only, append-only migrations. Never edit a shipped migration; add a new one.
 * See docs/data-model.md for the entity diagram.
 */
export const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: /* sql */ `
      create table assets (
        id          text primary key,              -- sha256 of the bytes (content address)
        name        text not null,
        kind        text not null check (kind in ('model', 'audio')),
        mime        text not null,
        size        integer not null,
        created_at  timestamptz not null default now(),
        created_by  text not null
      );

      create table documents (
        id            text primary key,
        kind          text not null check (kind in ('character', 'environment', 'show')),
        name          text not null,
        draft         jsonb not null,               -- mutable working copy
        draft_version integer not null default 1,   -- optimistic concurrency token
        created_at    timestamptz not null default now(),
        created_by    text not null,
        updated_at    timestamptz not null default now(),
        updated_by    text not null
      );

      create table bundles (
        sha256          text primary key,           -- sha256 of body (exact bytes devices receive)
        show_id         text not null references documents(id),
        revision        integer not null,
        environment_id  text not null,
        body            text not null,              -- canonical JSON, never re-serialized
        signature       text,                       -- set on safety approval
        created_at      timestamptz not null default now()
      );

      create table revisions (
        doc_id         text not null references documents(id),
        revision       integer not null,
        kind           text not null,
        name           text not null,
        content        jsonb not null,              -- immutable snapshot of the draft
        sha256         text not null,               -- sha256 of canonical content
        note           text not null default '',
        status         text not null check (status in ('published', 'approved', 'rejected')),
        published_by   text not null,
        published_at   timestamptz not null default now(),
        reviewed_by    text,
        reviewed_at    timestamptz,
        review_note    text,
        bundle_sha256  text references bundles(sha256),
        primary key (doc_id, revision)
      );

      create table devices (
        environment_id text not null,
        id             text not null,
        kind           text not null,
        firmware       text not null,
        character_ref  jsonb,
        state          text not null,
        staged         jsonb not null default '[]',
        active         jsonb,
        fault          text,
        last_seen_at   timestamptz,
        primary key (environment_id, id)
      );

      create table deployments (
        id              text primary key,
        environment_id  text not null,
        show_id         text not null,
        revision        integer not null,
        name            text not null,
        sha256          text not null references bundles(sha256),
        created_by      text not null,
        created_at      timestamptz not null default now()
      );
      create index deployments_env on deployments (environment_id, created_at desc);

      -- desired state per device; the gateway reconciles reported state towards it
      create table desired_bundles (
        environment_id text not null,
        device_id      text not null,
        sha256         text not null references bundles(sha256),
        created_at     timestamptz not null default now(),
        primary key (environment_id, device_id, sha256)
      );

      create table show_runs (
        id              text primary key,
        environment_id  text not null,
        show_id         text not null,
        revision        integer not null,
        name            text not null,
        sha256          text not null,
        start_at        double precision not null,   -- epoch ms, fleet clock
        duration_ms     integer not null,
        launched_by     text not null,
        stopped_at      timestamptz,
        stop_reason     text
      );
      create index show_runs_env on show_runs (environment_id, start_at desc);

      create table estops (
        environment_id text primary key,
        active         boolean not null,
        at             timestamptz,
        actor          text,
        reason         text
      );

      create table audit_log (
        seq        serial primary key,
        at         timestamptz not null,
        actor      text not null,
        action     text not null,
        entity     text not null,
        entity_id  text not null,
        details    jsonb not null,
        prev_hash  text not null,
        hash       text not null unique
      );
    `,
  },
  {
    version: 2,
    name: 'projects and per-project access',
    sql: /* sql */ `
      create table projects (
        id          text primary key,
        name        text not null,
        description text not null default '',
        created_at  timestamptz not null default now(),
        created_by  text not null
      );

      create table project_members (
        project_id  text not null references projects(id),
        user_name   text not null,
        role        text not null check (role in ('owner', 'editor', 'reviewer', 'operator', 'viewer')),
        added_by    text not null,
        added_at    timestamptz not null default now(),
        primary key (project_id, user_name)
      );

      -- Documents created before projects existed land in "general" (admins grant access).
      insert into projects (id, name, description, created_by)
        values ('general', 'General', 'Documents created before projects existed', 'system');
      alter table documents add column project_id text not null default 'general' references projects(id);
      create index documents_project on documents (project_id);
    `,
  },
  {
    version: 3,
    name: 'projects are shows; locations',
    sql: /* sql */ `
      -- A project is one show: same id, and the show carries its name and description.
      -- Every existing show becomes its own project with the members of the project it was in.
      insert into projects (id, name, description, created_at, created_by)
        select d.id, d.name, '', d.created_at, d.created_by from documents d
        where d.kind = 'show' and not exists (select 1 from projects p where p.id = d.id);
      insert into project_members (project_id, user_name, role, added_by, added_at)
        select d.id, m.user_name, m.role, m.added_by, m.added_at
        from documents d join project_members m on m.project_id = d.project_id
        where d.kind = 'show' and d.project_id <> d.id
        on conflict do nothing;

      -- Characters (the library) and environments (locations) are shared with the workspace.
      alter table documents alter column project_id drop default;
      alter table documents alter column project_id drop not null;
      update documents set project_id = case when kind = 'show' then id else null end;
      delete from project_members where project_id not in (select id from documents where kind = 'show');
      delete from projects where id not in (select id from documents where kind = 'show');
      alter table projects drop column name, drop column description;

      create table locations (
        id          text primary key,
        name        text not null,
        region      text not null default '',
        description text not null default '',
        created_at  timestamptz not null default now(),
        created_by  text not null
      );
      alter table documents add column location_id text references locations(id);
      insert into locations (id, name, description, created_by)
        select 'unassigned', 'Unassigned', 'Environments created before locations existed', 'system'
        where exists (select 1 from documents where kind = 'environment');
      update documents set location_id = 'unassigned' where kind = 'environment';
      create index documents_location on documents (location_id);

      alter table documents add constraint documents_scope check (
        (kind = 'show') = (project_id is not null) and (kind = 'environment') = (location_id is not null)
      );
    `,
  },
  {
    version: 4,
    name: 'projects can be deleted and recovered',
    sql: `
      -- Soft delete: hidden everywhere and read-only until an owner or admin recovers it.
      alter table projects add column deleted_at timestamptz, add column deleted_by text;
    `,
  },
]
