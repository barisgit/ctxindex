# CLI overview

ctxindex exposes uniform verbs over loaded Profiles and Adapters:

```text
init                              initialize local state
realm / client / account / source configure and inspect access
secrets                           inspect or switch the secret backend
sync / search                     discover context
get / thread get                  retrieve complete Resources
artifact / export                 materialize bytes
action describe / run            execute typed provider Actions
status / purge                    inspect and maintain local state
extensions / describe            inspect loaded definitions
skills                            inspect bundled workflow guidance
```

The fixed access lifecycle is:

```text
client add <provider> [--label <label>] --from-env
client list [--json]
client remove <provider> <label>
account add <provider> [--label <label>] [--client <label>]
account list [--json]
account remove <label>
source add <adapter-id> --realm <realm> [--account <label|id>] [--label <label>] [adapter flags]
source list
source remove <label|id>
```

Every Source belongs to exactly one Realm. Omitting a realm filter searches all Realms; an explicit filter is exact. Client labels are unique per provider, while Account and Source labels are globally unique bare handles.

`search` accepts query text, filters, or both. With at least one filter
(`--realm`, `--adapter`, `--source`, `--kind`, `--field`, `--since`, `--until`)
the query is optional: a filter-only search enumerates local Resources newest
first and never routes to providers. Local executions (filter-only, or a query
with `--local-only`) paginate with `--limit`/`--offset`; the JSON result
includes `pagination: { offset, limit, hasMore }` — advance `--offset` by
`--limit` while `hasMore` is true. Remote enumeration and remote pagination are
not supported: `--remote` requires query text and rejects `--offset`.

Indexed calendar Sources use the same `sync`, `search`, and `get` verbs as
other context. Their event Refs remain distinct across Sources even when a
provider event id overlaps. Loaded Calendar Adapters declare no mutation
Actions.

The CLI is non-interactive: required input comes from flags, declared environment variables, typed secret references, or explicitly declared stdin. OAuth Client credentials are read from the environment only by `client add --from-env`; later authorization uses the persisted Client. Machine-readable output uses deterministic JSON. Valid kinds, fields, formats, Source flags, and Actions are derived from loaded registries. List loaded definitions with `ctxindex describe`, then inspect one with `ctxindex describe <profile|adapter|action> <id> --json`. Use `ctxindex describe --full --format markdown` only for a complete generated snapshot, and inspect activated Extensions with `ctxindex extensions list`.
