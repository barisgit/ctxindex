# CLI overview

ctxindex exposes uniform verbs over loaded Profiles and Adapters:

```text
realm / auth / source     configure access
sync / search             discover context
get / thread get          retrieve complete Resources
artifact / export         materialize bytes
action describe / run     execute typed provider Actions
status / purge            inspect and maintain local state
extensions / describe     inspect loaded definitions
```

Every Source belongs to exactly one Realm. Omitting a realm filter searches all Realms; an explicit filter is exact.

The CLI is non-interactive: required input comes from flags, environment variables, or explicitly declared stdin. Machine-readable output uses deterministic JSON. Valid kinds, fields, formats, Source flags, and Actions are derived from loaded registries. List loaded definitions with `ctxindex describe`, then inspect one with `ctxindex describe <profile|adapter|action> <id> --json`. Use `ctxindex describe --full --format markdown` only for a complete generated snapshot, and inspect activated Extensions with `ctxindex extensions list`.
