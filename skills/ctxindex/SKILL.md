---
name: ctxindex
description: Use ctxindex when an agent needs deterministic access to configured personal or work context—email, calendars, local files, and Extension-defined Sources—through one local typed CLI. Discover loaded schemas, search scoped Realms and Sources, retrieve opaque ctx:// references, export data, and run declared Actions without provider-specific integrations.
---

# ctxindex

ctxindex is a local personal-context gateway for shell-capable agents. It provides one provider-neutral interface over configured mail, calendars, files, and loaded Extensions.

## Learn the installed interface

Treat the installed CLI and its bundled documentation as authoritative:

```sh
ctxindex docs list --format json
ctxindex docs search "<topic>" --format json
ctxindex docs get <path>
ctxindex describe --format json
ctxindex describe <profile|adapter|action> <id> --format json
ctxindex --help
```

Do not guess loaded kinds, fields, Source options, export formats, or Action schemas. Discover them with `describe`. Scope searches by Realm or Source when context boundaries matter, preserve returned `ctx://` Refs as opaque values, use `--format json` for programmatic consumption, and check the process exit code before reading stdout.

## Compose commands in Bash

This example searches one Realm, selects the first returned Ref, and retrieves its complete Resource. It requires `jq` and stops if either command fails or the search returns no result.

```sh
set -euo pipefail

results="$(ctxindex search "quarterly planning" \
  --realm work \
  --limit 1 \
  --format json)"

ref="$(jq -er '.results[0].ref' <<<"$results")"
ctxindex get "$ref" --format json
```

Use each loaded Action's discovered schema and effect metadata before invoking it.
