# Agent how-tos for ctxindex

This page is workflow guidance for autonomous agents driving the V1 CLI from a clean checkout. Runtime vocabulary is not repeated here: inspect the activated Extensions and generated interface before constructing commands.

## Prerequisites

Run from the repository root. The supported development invocation is `bun cli` (or `bun run cli` from the repository root or `apps/cli`); there is no `bun link` workflow.

```sh
bun install
bash scripts/verify/cli.sh
bun cli extensions list
bun cli describe
```

The compact generated index is authoritative for loaded definition IDs. Inspect one definition with `bun cli describe <profile|adapter|action> <id> --json`; request `bun cli describe --full --format markdown` only when a complete snapshot is needed. Detail output owns aliases, field types, export formats, Adapter configuration flags, and Action schemas.

## Fresh isolated state

Tests and checkpoints must use isolated XDG/CTXINDEX directories. Initialize the selected home, then create an explicit Realm; V1 has no implicit Realm.

```sh
bun cli init
bun cli realm add personal --name Personal
```

## Add and query a Source

Choose an Adapter and its generated options from `describe`, then bind the Source to an explicit Realm.

```sh
bun cli source add <adapter-id> --realm personal <generated-adapter-options>
bun cli sync
bun cli search '<query>' --realm personal --json
bun cli status --json
```

Use `sync` only when the selected Adapter declares that capability. Federated Sources can be searched remotely immediately. Follow returned stable `ctx://` Refs with the generic retrieval verbs:

```sh
bun cli get <ref> --json
bun cli thread get <ref> --json
bun cli artifact list <ref> --json
bun cli artifact download <artifact-ref> --output <path> --json
bun cli export <ref> --format <generated-format> --output <path> --json
```

Before any provider mutation, inspect the generated reversible Action schema and select the Source explicitly. V1 supports Draft persistence only and never sends mail.

```sh
bun cli action describe <generated-action-id> --source <source-id> --json
bun cli action run <generated-action-id> --source <source-id> --input <json-or-file> --json
```

## Bundled skills

```sh
bun cli skills list
bun cli skills get getting-started
bun cli skills get getting-started --inline
bun cli skills path
```

## Secrets, clients, and provider Accounts

Inspect the configured secret backend or switch it explicitly. A switch copies
and verifies stored values before committing configuration and cleaning the old
backend; secret values are never accepted on this command line.

```sh
bun cli secrets status --json
bun cli secrets backend set keychain
bun cli secrets backend set file
```

Discover OAuth provider ids, exact Adapter scopes, API hosts, and safe client environment variable names from the loaded registry rather than copying provider-specific vocabulary into prompts or scripts. The CLI does not prompt for credentials and never accepts secret values on argv. `client add --from-env` reads the provider's declared environment values once and persists them through the configured secrets backend; later authorization never resolves client credentials from the environment. An Account loopback flow may open a browser only after explicit operator approval.

```sh
bun cli describe adapter <adapter-id>
bun cli describe adapter <adapter-id> --json
bun cli client add <provider> --from-env
bun cli client list
bun cli account add <provider>
bun cli account list --json
```

When a provider has multiple persisted clients, pass `--client <label>` to `account add`; with exactly one, it is selected automatically. Client labels default to the provider id and are unique per provider; Account labels default to the verified provider identity, and Source labels default to `<account-label>-<adapter-tail>` or `<adapter-tail>` without an Account. Account and Source labels are globally unique. Labels remain verbatim, and collisions fail with exit 2 instead of prompting or auto-suffixing. Re-running `account add` for the same identity updates its Grant in place so existing Source bindings remain valid. `client remove <provider> <label>` removes Client metadata and secrets without breaking existing Grants; `account remove <label>` removes the Account and Grant while leaving bound Sources configured as `needs_auth`. Do not run live provider tests from the general automated lane. Accepted live checks use the isolated Human checkpoint procedure and redacted evidence under the active charter.

Account authorization requests the provider base scopes plus the sorted union
of all loaded Adapters for that provider. Calendar Adapters are indexed and
read-only: synchronize them before local event searches, and do not invent
Actions that are absent from `describe`. Keep
personal and work Sources in explicit separate Realms; an unscoped search spans
both, while an explicit Realm filter is exact.

```sh
bun cli client add <provider-id> --label <client-label> --from-env
bun cli account add <provider-id> --client <client-label> --label <account-label>
bun cli account list --json
bun cli source add <calendar-adapter-id> --realm <realm> --account <account-label> --label '<calendar-label>' <generated-calendar-options>
bun cli sync --source <calendar-label> --json
bun cli search '<query>' --kind <event-profile-id-or-alias> --realm <realm> --json
bun cli get <ctx-calendar-event-ref> --json
```

Mocked provider coverage is implemented by the CLI e2e tests for search/get, Draft Actions, and network egress. Those tests supply loopback-only endpoints and synthetic credentials; never substitute real credentials into that lane.

## Verification

Run narrow checks first, then the repository gates required by the active OpenSpec task:

```sh
bun run typecheck
bun run lint
bun test
bun run test:integration
bun run test:e2e
bun run ci
bun test --path-ignore-patterns '__none__' apps/cli/src/e2e/compiled-extension.e2e.test.ts
openspec validate --all --strict
```

Stable exit meanings and agent responses are owned by [`openspec/specs/error-taxonomy/spec.md`](../openspec/specs/error-taxonomy/spec.md); do not maintain a second exit-code table here.
