# 2. Immutable revisions, deterministic content-addressed bundles, signed on approval

Status: accepted

**Context.** Regulators and incident reviews need to know exactly what ran. A show must not change between review and performance.

**Decision.** Publishing freezes a revision (hash of canonical content). Shows compile to a deterministic bundle (canonical JSON, no timestamps) addressed by its SHA-256. Safety approval signs the exact bundle bytes (RSA-SHA256, PKCS#1 v1.5). Devices verify hash and signature with a key pinned at provisioning and refuse anything else.

**Consequences.** Any edit after approval produces a new revision requiring a new approval. Rollback means deploying an older hash. Key management (rotation, HSM/KMS) becomes a production concern.
