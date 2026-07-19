---
name: repo-development
description: "Use when developing ctxindex: CLI workflows, deciding where behavior belongs, gates/tests, or OpenSpec-backed changes."
---

# Repo Development

Use this skill before changing ctxindex behavior, driving the development CLI, or choosing an implementation owner. Keep each concern in the one place that owns it, then verify with the smallest check that proves the change.

## Start here

Read these first unless already in context:

1. `README.md`
2. `CONTEXT.md`
3. The relevant `openspec/specs/<capability>/spec.md` and adjacent `implementation.md` when behavior or stable technical shape changes
4. `SYSTEM.md` for a readable, non-normative orientation
5. The files and focused tests you intend to change

`CONTEXT.md` owns terminology, capability specs own behavior, and `implementation.md` sidecars own selective interface-first doctrine. Do not turn this skill into another source of product truth.

Implementation sidecars describe seams at the module/package level; `codemap.md` owns file layout. Never use source-file paths as locations. Prioritize interfaces, type aliases, discriminated or schema-derived types, and full generic signatures with every type parameter and constraint intact. Keep exported functions secondary and signature-only, prefer the types they consume and produce, and copy every listed member from current source; never publish an empty interface shell.

## Choose the owner

| Change | Owner |
| --- | --- |
| Domain vocabulary, portable semantics, searchable fields, export formats, typed Actions | Profiles |
| Provider authentication, discovery, retrieval, synchronization, artifacts, and mutations | Adapters |
| A distributable set of Profiles and Adapters | Extensions |
| Realm, Source, Resource, Ref, storage, orchestration, and other shared runtime behavior | Provider-neutral core |
| Argument parsing, generated help, formatting, and service delegation | Thin CLI |

Profiles define domain vocabulary; Adapters perform provider I/O; Extensions only bundle definitions. Core must remain provider-neutral, and the CLI must not absorb business logic. Repository gates such as `scripts/verify/module-architecture.test.ts`, `scripts/verify/cli-no-business-logic.ts`, and `scripts/verify/cli-thin-lines.ts` enforce these boundaries.

For non-trivial behavior changes, work from the active OpenSpec change and apply tasks in dependency order. If no current capability or approved change owns a new contract, create the OpenSpec change before implementation. Trivial fixes may proceed directly when they do not alter a stable contract.

## Start the development CLI

Run from the repository root. The supported development invocation is `bun cli` (or `bun run cli` from the repository root or `apps/cli`); there is no `bun link` workflow.

```sh
bun install
bash scripts/verify/cli.sh
bun cli extensions list
bun cli describe
```

The loaded registry and generated interface are authoritative vocabulary. The compact generated index lists loaded definition IDs. Inspect one definition with `bun cli describe <profile|adapter|action> <id> --json`; request `bun cli describe --full --format markdown` only when a complete snapshot is needed. Detail output owns aliases, field types, export formats, Adapter configuration flags, OAuth declarations, and Action schemas. Do not copy provider-specific IDs, fields, scopes, or formats from this skill into automation.

## Use fresh isolated state

Development workflows, tests, and checkpoints must use isolated XDG or `CTXINDEX_*_HOME` directories. One convenient shell setup is:

```sh
CTXINDEX_DEV_HOME="$(mktemp -d)"
export XDG_CONFIG_HOME="$CTXINDEX_DEV_HOME/config"
export XDG_DATA_HOME="$CTXINDEX_DEV_HOME/data"
export XDG_STATE_HOME="$CTXINDEX_DEV_HOME/state"
export XDG_CACHE_HOME="$CTXINDEX_DEV_HOME/cache"
```

Initialize that state, then create an explicit Realm. There is no implicit Realm.

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

For a recent remote mailbox listing, select one Source and message kind explicitly; query text is optional when a Source, kind, field, or time constraint narrows `--remote`. Derive the exact kind and boolean field name from `describe` rather than copying provider vocabulary. For a Profile that declares `unread`, both `--field unread=true` and `--field unread=false` are exact booleans.

Remote paging is cursor-based and distinct from local offsets. With one exact `--source`, inspect JSON `pagination.hasMore` and repeat the unchanged remote search and `--limit` with `--continuation <pagination.continuation>` until false. A `truncated` warning paired with a non-null continuation means more provider results are resumable, not silently lost. Never combine continuation with `--offset` or `--local-only`; `--offset` remains local pagination only.

Before any provider mutation, inspect the generated reversible Action schema and select the Source explicitly. Provider mutations stop at reversible email Draft create/update; ctxindex never sends mail.

```sh
bun cli action describe <generated-action-id> --source <source-id> --json
bun cli action run <generated-action-id> --source <source-id> --input <json-or-file> --json
```

## Inspect bundled skills

```sh
bun cli skills list
bun cli skills get getting-started
bun cli skills get getting-started --inline
bun cli skills path
```

## Configure secrets, clients, and Accounts

Inspect the configured secret backend or switch it explicitly. A switch copies and verifies stored values before committing configuration and cleaning the old backend; secret values are never accepted on this command line.

```sh
bun cli secrets status --json
bun cli secrets backend set keychain
bun cli secrets backend set file
```

Discover OAuth provider IDs, exact Adapter scopes, API hosts, and safe client environment variable names from the loaded registry rather than copying provider-specific vocabulary into prompts or scripts. The CLI does not prompt for credentials and never accepts secret values on argv. `client add --from-env` reads the provider's declared environment values once and persists them through the configured secrets backend; later authorization never resolves client credentials from the environment. An Account loopback flow may open a browser only after explicit operator approval.

```sh
bun cli describe adapter <adapter-id>
bun cli describe adapter <adapter-id> --json
bun cli client add <provider> --from-env
bun cli client list
bun cli account add <provider>
bun cli account list --json
```

When a provider has multiple persisted Clients, pass `--client <label>` to `account add`; with exactly one, it is selected automatically. Client labels default to the provider ID and are unique per provider. Account labels default to the verified provider identity. Source labels default to `<account-label>-<adapter-tail>` or `<adapter-tail>` without an Account. Account and Source labels are globally unique. Labels remain verbatim, and collisions fail with exit 2 instead of prompting or auto-suffixing.

Re-running `account add` for the same identity updates its Grant in place so existing Source bindings remain valid. `client remove <provider> <label>` removes Client metadata and secrets without breaking existing Grants. `account remove <label>` removes the Account and Grant while leaving bound Sources configured as `needs_auth`.

Account authorization requests the provider base scopes plus the sorted union of all loaded Adapters for that provider. Calendar Adapters are indexed and read-only: synchronize them before local event searches, and do not invent Actions absent from `describe`. Keep personal and work Sources in explicit separate Realms; an unscoped search spans both, while an explicit Realm filter is exact.

```sh
bun cli client add <provider-id> --label <client-label> --from-env
bun cli account add <provider-id> --client <client-label> --label <account-label>
bun cli account list --json
bun cli source add <calendar-adapter-id> --realm <realm> --account <account-label> --label '<calendar-label>' <generated-calendar-options>
bun cli sync --source <calendar-label> --json
bun cli search '<query>' --kind <event-profile-id-or-alias> --realm <realm> --json
bun cli get <ctx-calendar-event-ref> --json
```

Do not run live provider tests from the general automated lane. Accepted live checks use the isolated Human checkpoint procedure and redacted evidence under the active charter. Mocked CLI e2e coverage supplies loopback-only endpoints and synthetic credentials for search/get, Draft Actions, and network egress; never substitute real credentials into that lane.

## Verify the smallest proof first

Start with the narrowest test or gate that directly covers the edit. Examples:

```sh
bun test scripts/verify/repo-development-skill.test.ts
bun test <focused-test-path>
bun run scripts/verify/cli-thin-lines.ts
```

Expand only as the affected surface requires. Before completion, run the repository's final gates:

```sh
bun run ci
bunx openspec validate --all --strict
```

Stable exit meanings and agent responses are owned by `openspec/specs/error-taxonomy/spec.md`; do not maintain a second exit-code table here.
