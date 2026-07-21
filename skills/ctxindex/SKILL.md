---
name: ctxindex
description: Use ctxindex when an agent needs deterministic access to configured email, calendars, local files, or Extension-defined context through one local typed CLI. Discover loaded schemas, search scoped Realms and Sources, retrieve opaque ctx:// references, export data, and run declared Actions.
---

# ctxindex

ctxindex is a local personal-context gateway for configured mail, calendars, files, and Extension-defined Sources. Use the installed CLI as the authority: loaded Extensions can add Profiles, Adapters, fields, formats, Actions, and documentation.

## Discover before acting

```sh
ctxindex --help
ctxindex docs list --format json
ctxindex docs search "<topic>" --format json
ctxindex docs get <path>
ctxindex describe --format json
ctxindex source list --format json
```

Before using one definition or Action, inspect it exactly:

```sh
ctxindex describe <profile|adapter|action> <id> --format json
```

Do not guess loaded vocabulary or input schemas. Scope sensitive searches by exact Realm or Source, preserve returned `ctx://` Refs unchanged, check the process exit code, and use `--format json` for typed composition or `--format text` for lower token usage.

## Search, select, retrieve

This Bash example requires `jq` and stops on failure or an empty result:

```sh
set -euo pipefail

results="$(ctxindex search "quarterly planning" \
  --realm work \
  --limit 1 \
  --format json)"

ref="$(jq -er '.results[0].ref' <<<"$results")"
ctxindex get "$ref" --format json
```

Inspect an Action's discovered schema and effect metadata before invoking it. Keep agent policy and approval outside ctxindex; use ctxindex for context access and declared typed Actions.
