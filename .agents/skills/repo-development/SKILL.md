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
| External-service authentication, registration, base scopes, identity, and allowed hosts | Providers |
| Source configuration, requested access, discovery, retrieval, synchronization, artifacts, and mutations | Adapters |
| A distributable plain-value root of Adapters, OAuth Apps, and optional standalone Providers/Profiles | Extensions |
| Realm, Source, Resource, Ref, storage, orchestration, and other shared runtime behavior | Provider-neutral core |
| Argument parsing, generated help, formatting, and service delegation | Thin CLI |

Profiles define domain vocabulary; Providers define reusable external-service authorization; Adapters perform Source I/O and may be provider-bound or providerless; Extensions only bundle exact imported plain values. Core must remain provider-neutral, and the CLI must not absorb business logic. Repository gates such as `tests/tooling/verify/module-architecture.test.ts`, `scripts/verify/cli-no-business-logic.ts`, and `scripts/verify/cli-thin-lines.ts` enforce these boundaries.

For non-trivial behavior changes, work from the active OpenSpec change and apply tasks in dependency order. If no current capability or approved change owns a new contract, create the OpenSpec change before implementation. Trivial fixes may proceed directly when they do not alter a stable contract.

## Start the development CLI

Run from the repository root. The checkout-oriented development invocation is
`bun cli` (or `bun run cli` from the repository root or `apps/cli`). To exercise
the installable package bin, build it and register the CLI workspace with Bun:

```sh
cd apps/cli
bun run build:package
bun link
ctxindex --help
```

```sh
bun install
bun run build:cli
bun cli --help
bun cli extension list
bun cli describe
```

The loaded registry and generated interface are authoritative vocabulary. The compact generated index lists loaded definition IDs. Inspect one definition with `bun cli describe <profile|adapter|action> <id> --format json`; request `bun cli describe --full --format markdown` only when a complete snapshot is needed. Detail output owns aliases, field types, export formats, Adapter configuration flags, OAuth declarations, and Action schemas. Do not copy provider-specific IDs, fields, scopes, or formats from this skill into automation.

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
bun cli search '<query>' --realm personal --format json
bun cli status --format json
```

Use `sync` only when the selected Adapter declares that capability. Federated Sources can be searched remotely immediately. Follow returned stable `ctx://` Refs with the generic retrieval verbs:

```sh
bun cli get <ref> --format json
bun cli thread <ref> --format json
bun cli artifact list <ref> --format json
bun cli artifact download <artifact-ref> --output <path> --format json
bun cli export <ref> --format <generated-format> > output.ext
```

For a recent remote mailbox listing, select one Source and message kind explicitly; query text is optional when a Source, kind, field, or time constraint narrows `--remote`. Derive the exact kind and boolean field name from `describe` rather than copying provider vocabulary. For a Profile that declares `unread`, both `--field unread=true` and `--field unread=false` are exact booleans.

Remote paging is cursor-based and distinct from local offsets when the selected Adapter returns a continuation. With one exact `--source`, inspect JSON `pagination.hasMore`; when its continuation is non-null, repeat the unchanged remote search and `--limit` with `--continuation <pagination.continuation>` until false. A `truncated` warning paired with a non-null continuation means more provider results are resumable, not silently lost. The current Microsoft mailbox Adapter supports this flow; the Gmail mailbox Adapter returns no continuation and rejects a supplied token as `invalid_filter` before provider I/O. Never combine continuation with `--offset` or `--local-only`; `--offset` remains local pagination only.

Before any provider mutation, inspect the generated reversible Action schema and select the Source explicitly. Provider mutations stop at reversible email Draft create/update; ctxindex never sends mail.

```sh
bun cli describe action <generated-action-id> --source <source-id> --format json
bun cli action run <generated-action-id> --source <source-id> --input <json-or-file> --format json
```

## Inspect bundled skills

```sh
bun cli skills list
bun cli skills get getting-started
bun cli skills get getting-started --inline
bun cli skills path
```

## Configure secrets, OAuth Apps, and Accounts

Inspect the configured secret backend or switch it explicitly. A switch copies and verifies stored values before committing configuration and cleaning the old backend; secret values are never accepted on this command line.

```sh
bun cli secrets status --format json
bun cli secrets backend set keychain
bun cli secrets backend set file
```

Discover OAuth Provider ids, exact Adapter scopes, API hosts, App labels, and local-App environment mapping from the loaded registry and safe inventory rather than copying provider-specific vocabulary into prompts or scripts. The CLI does not prompt for credentials and never accepts App config or secret values on argv. `oauth-app add <provider> <label> --from-env` reads the Provider's complete declared environment mapping once, validates it, and persists it through the configured secrets backend; later authorization snapshots the selected App into the private Grant and never rereads App config from the environment. An Account loopback flow may open a browser only after explicit operator approval.

```sh
bun cli describe adapter <adapter-id>
bun cli describe adapter <adapter-id> --format json
bun cli oauth-app add <provider> <app-label> --from-env
bun cli oauth-app list
bun cli account add <provider> --app <app-label>
bun cli account list --format json
```

OAuth App selection is always exact. When `--app` is omitted, core selects only one active Extension App that exactly matches the host's managed-App policy; it never guesses from local or unreviewed Apps. Supplying `--app <label>` bypasses managed-default selection and is the deterministic path for any Extension App or local BYOA App. App labels are unique per Provider across Extension Apps and local BYOA Apps; neither origin can shadow the other. `oauth-app list` exposes only Provider id, label, origin, and safe provenance. Account labels default to the verified provider identity. Source labels default to `<account-label>-<adapter-tail>` or `<adapter-tail>` without an Account. Account and Source labels are globally unique. Labels remain verbatim, and collisions fail with exit 2 instead of prompting or auto-suffixing.

Re-running `account add` for the same identity updates its Grant and App snapshot in place so existing Source bindings remain valid. `oauth-app remove <provider> <label>` removes local App metadata and config without breaking existing Grants; Extension Apps are removed only by changing the active Extension set. `account remove <label>` removes the Account and Grant while leaving bound Sources configured as `needs_auth`.

Account authorization requests the provider base scopes plus the sorted union of all loaded Adapters for that provider. Calendar Adapters are indexed and read-only: synchronize them before local event searches, and do not invent Actions absent from `describe`. Keep personal and work Sources in explicit separate Realms; an unscoped search spans both, while an explicit Realm filter is exact.

```sh
bun cli oauth-app add <provider-id> <app-label> --from-env
bun cli account add <provider-id> --app <app-label> --label <account-label>
bun cli account list --format json
bun cli source add <calendar-adapter-id> --realm <realm> --account <account-label> --label '<calendar-label>' <generated-calendar-options>
bun cli sync --source <calendar-label> --format json
bun cli search '<query>' --kind <event-profile-id-or-alias> --realm <realm> --format json
bun cli get <ctx-calendar-event-ref> --format json
```

Do not run live provider tests from the general automated lane. Accepted live checks use the isolated Human checkpoint procedure and redacted evidence under the active charter. Mocked CLI e2e coverage supplies loopback-only endpoints and synthetic credentials for search/get, Draft Actions, and network egress; never substitute real credentials into that lane.

## Verify the smallest proof first

Start with the narrowest test or gate that directly covers the edit. Examples:

```sh
bun test ././tests/tooling/verify/repo-development-skill.test.ts
bun test <focused-test-path>
bun run scripts/verify/cli-thin-lines.ts
```

Expand only as the affected surface requires. Before completion, run the repository's final gates:

```sh
bun run ci
bun run test:integration
bun run test:e2e
bunx openspec validate --all --strict
```

Stable exit meanings and agent responses are owned by `openspec/specs/error-taxonomy/spec.md`; do not maintain a second exit-code table here.
