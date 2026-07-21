# apps/cli/src/commands/

## Responsibility

Defines the authoritative Citty command tree and thin typed adapters connecting parsed command values, workflows, core services, formatting, and stable exits.

## Design / patterns

- Each module exports a `defineCtxCommand` descriptor whose argument definition owns parsing, strict validation, and help metadata; handlers consume inferred `args` and delegate through `runWithExit`.
- `oauth-app.ts` delegates add/list/remove to `oauth-app/handle-oauth-app-command.ts` without argv config fields.
- `account.ts` delegates add/list/remove to `account/handle-account-command.ts`; that workflow preflights and authorizes with one exact provider-matched OAuth App, lists safe Account authorization/labeled-Source inventory, and removes Accounts by global label.
- `source.ts` obtains generated Adapter config flags from the ensured daemon's immutable registry projection (or one shared-owner-protected local snapshot on an unsupported platform) and retains that single route plus projection through execution; its per-invocation cleanup releases a direct owner after help, parse rejection, or handler completion. Realm, Source, search, get, thread, status, sync, and Extension-documentation handlers ensure typed daemon procedures before direct dependencies.
- `action run`, exact Action describe, sync, status, and search descriptors advertise Source label-or-ID inputs; search additionally documents opaque single-Source remote continuation, and handlers resolve Source references before core calls.
- `thread.ts` is a leaf for `thread <ref>`; `artifact.ts` groups list/download/purge; `action.ts` retains only run; and `describe.ts` owns source-aware exact Action inspection.
- `account`, `oauth-app`, `realm`, `source`, `extension list`, `status`, `search`, `get`, `thread`, and `artifact list` reuse the shared pretty/text/json definition and resolve destination-aware defaults before workflow effects. `export`, `describe`, sync, daemon lifecycle, Artifact download, and Artifact purge retain their independent output domains.
- `secrets.ts`, `status.ts`, `get.ts`, `export.ts`, and `skills.ts` define their full public grammar and pass typed values directly into focused workflows. Ref and secret-backend semantic validation remains effect-free inside those workflows, while enum/default/help behavior comes from the descriptors.
- `init.ts` is a thin descriptor that delegates the full leased initialization lifecycle to the top-level `direct-database.ts` boundary.
- `docs.ts` groups the offline `list`, exact `get`, and bounded text `search` descriptors; `../docs/command.ts` owns source composition, safe projections, explicit output-copy semantics, and rendering.
- `extensions.ts` is a minimal registration re-export; the `extensions/` workflow folder owns the nested Catalog descriptors and core-service delegation.

## Data & control flow

`main.ts` registers descriptors and builds a fresh Source runtime for each `runCli()` invocation. The shared command model resolves and validates one command path before effects, Citty supplies typed values to the selected handler, and promoted stateful workflows ensure one exact daemon on supported platforms. Unsupported platforms retain the direct route; a successful ensure is authoritative and never falls back. Workflows render output, close dependencies, and return a stable code. `runCli()` always closes the invocation runtime and preserves route-acquisition exit mapping. `db.ts` retains only the explicit-initialization preflight; leased database ownership lives in `../direct-database.ts`.

## Integration points

Consumed by `main.ts`; shared command validation/help lives in `command-model.ts`. Wiring is in `deps.ts`, `direct-database.ts`, `definitions.ts`, workflow folders including `account/`, `action/`, `artifact/`, `describe/`, `docs/`, `thread/`, `oauth-app/`, and `extensions/`, and `format/`. The remaining `args/` modules are shared flag utilities and narrow search/source helpers rather than parallel public-command grammars.
