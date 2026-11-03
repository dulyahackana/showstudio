# 10. Projects with per-project access, inside one workspace

Status: superseded in part by [ADR 11](0011-projects-are-shows.md) (what a project contains)

**Context.** A studio serves several attraction programmes at once, with different teams, reviewers and operators. Global roles alone would let any operator launch any attraction and any engineer edit any figure.

**Decision.** Add a product-lifecycle structure: one workspace (the tenant), projects, and documents that each belong to exactly one project. Access is granted per project with five roles: owner, editor, reviewer, operator and viewer. The permission matrix lives in the shared contract (`PROJECT_PERMISSIONS`), so the server enforces it and the editor hides what you cannot do. Workspace roles stay and must also allow the action. Non-members get 404, so nothing leaks. A project always keeps one owner, and every membership change is audited. The software e-stop deliberately ignores project roles: anyone signed in can stop any attraction.

**Consequences.** Several attractions (one project can hold many) run and launch independently with their own teams. The migration is forward-only: existing documents move to a "General" project that admins can share. The workspace and its people directory are static here; in production they come from the identity provider (OIDC groups, SCIM), and multi-tenancy adds a tenant key with row-level security.
