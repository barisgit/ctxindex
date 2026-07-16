# CLI overview

ctxindex exposes uniform verbs over loaded Profiles and Adapters:

```text
init                         initialize local state
realm / auth / account / source  configure and inspect access
secrets                    inspect or switch the secret backend
sync / search             discover context
get / thread get          retrieve complete Resources
artifact / export         materialize bytes
action describe / run     execute typed provider Actions
status / purge            inspect and maintain local state
extensions / describe     inspect loaded definitions
skills                     inspect bundled workflow guidance
```

Every Source belongs to exactly one Realm. Omitting a realm filter searches all Realms; an explicit filter is exact.

Indexed calendar Sources use the same `sync`, `search`, and `get` verbs as
other context. Their event Refs remain distinct across Sources even when a
provider event id overlaps. Loaded Calendar Adapters declare no mutation
Actions.

The CLI is non-interactive: required input comes from flags, environment variables, or explicitly declared stdin. Machine-readable output uses deterministic JSON. Valid kinds, fields, formats, Source flags, and Actions are derived from loaded registries. List loaded definitions with `ctxindex describe`, then inspect one with `ctxindex describe <profile|adapter|action> <id> --json`. Use `ctxindex describe --full --format markdown` only for a complete generated snapshot, and inspect activated Extensions with `ctxindex extensions list`.
