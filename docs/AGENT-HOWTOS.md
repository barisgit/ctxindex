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

## Secrets and provider authentication

Inspect the configured secret backend or switch it explicitly. A switch copies
and verifies stored values before committing configuration and cleaning the old
backend; secret values are never accepted on this command line.

```sh
bun cli secrets status --json
bun cli secrets backend set keychain
bun cli secrets backend set file
```

For Google OAuth, required client input comes from flags or the documented environment variables; the CLI does not prompt for credentials. The loopback flow may require browser consent after explicit operator approval.

```sh
bun cli auth add google --from-env
# or, for an explicitly approved browser flow:
bun cli auth add google --client-id "$CTXINDEX_GMAIL_CLIENT_ID" --client-secret "$CTXINDEX_GMAIL_CLIENT_SECRET" --loopback
```

After authorization, discover the loaded mailbox Adapter and generated Source options with `describe`, then add it to the intended Realm. Do not run live provider tests from the general automated lane. The accepted live read and Draft checks use the isolated Human checkpoint procedure and redacted evidence under the active charter.

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
./scripts/spikes/d3-compiled-extension/run.sh
openspec validate v1-context-access-layer --strict
```

Stable exit meanings and agent responses are owned by `SPEC.md` §12; do not maintain a second exit-code table here.
