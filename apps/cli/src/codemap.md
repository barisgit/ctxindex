# apps/cli/src/

## Responsibility

Implements the CLI application layer: registers one authoritative Citty command tree, validates argv from those definitions, composes core services, delegates domain work, and renders stable output and exit codes.

## Design / patterns

- `main.ts` is the composition root. It registers singular `extension`, offline `docs`, explicit `oauth-app`, `account`, and `source` lifecycle commands plus detached daemon `start/status/stop`; removed aliases remain absent. Its root-command version comes from build-time `__CTXINDEX_VERSION__`, with `0.0.0` as the unbundled fallback.
- `command-model.ts` derives strict invocation validation, full-path help, root-help promotion, and reference projection from the same definitions. `commands/` is the thin typed Citty adapter layer, workflow folders own multi-step orchestration, `format/` owns presentation and exit mapping, and the remaining `args/` modules provide shared flag utilities plus narrow search/source helpers.
- `commands/db.ts` owns explicit-initialization preflight, while `direct-database.ts` owns retained shared-lease fencing from before every SQLite open through read-only local OAuth App identity or direct-uninstall Source binding discovery, open/migrate, close, and lease release; initialization and Extension-install identity preflight use the same fence. `deps.ts` can compose production services from the exact preloaded definition snapshot and retained owner rather than opening or loading again. `daemon/` owns selection and transport without importing the daemon app.
- `definitions.ts` loads configured Extensions from optional explicit config/data roots (defaulting to the canonical environment roots) and renders only host-generated safe diagnostics; registry descriptions and generated Source options derive runtime truth, and Action descriptions retain strict input alternatives.
- `extensions/` exposes trusted package-backed Catalog build, Git Catalog lifecycle/search, and versionless Catalog installation; core owns snapshot materialization, replay, persistence, and managed-extension loading, while `definitions.ts` loads the unified installed provenance offline.

## Data & control flow

1. `runCli()` builds one per-invocation command tree, normalizes built-in option values, validates the resolved invocation before effects, and dispatches typed Citty values through it; Source argument generation and execution share one retained route decision, direct owner, and definition projection, and invocation-final cleanup releases ownership even when validation rejects generated argv before the handler runs.
2. Database-backed flows require explicit `init`; `oauth-app add --from-env` acquires direct ownership before Extension imports, validates one loaded OAuth Provider snapshot before reading its declared registration environment names, and persists typed config refs through that same retained owner.
3. `account add` opens one retained direct dependency lifetime and either asks core to match one exact managed App against host-owned bundled policy or bypasses policy for an explicit `--app` label. Both paths use the ordinary exact same-provider resolver and create or update one stable Grant with a private App-config snapshot; unavailable/ambiguous managed selection fails before authorization with BYOA guidance, and removal clears bound Source grants.
4. Realm/Source management, sync, status, search, exact get, and `thread <ref>` select daemon RPC only from exact-tuple metadata or a test override and never fall back after selection; without a selector they retain the direct core path behind shared database ownership. Remaining SQLite-backed commands use the retained direct opener, and `init` uses the same lease fence.
5. `describe action <id> [--source]` routes schema and exact Source availability through the Action describe service, while `action run` alone performs typed mutations. Registry Action inputs flow through `format/`, which expands strict alternatives into numbered text or Markdown branches without provider-specific CLI commands.
6. `docs list|get|search` keeps the build-time bundled product-documentation source local. It composes direct loaded Extension documentation only with no daemon; after exact daemon selection it obtains Extension inventory, exact content, and search results solely from the daemon's immutable projection without fallback. Markdown stays inert, assets require explicit output, and neither route needs a web runtime or network lookup.
7. `extension catalog build --trust` materializes a trusted author package into an inert Catalog snapshot. Git Catalog add/refresh acquire immutable snapshots; Catalog list/show/search/install refresh by default, while `--no-refresh` reads persisted snapshots offline. Versionless Catalog install replays the exact stored entry through the shared generic installer and persists curation provenance; `extension list` loads unified managed records offline. Formatters add stored acquisition age and provenance, and failures flow through `mapErrorToExit` / `runWithExit`.

## Integration points

- Executed by `apps/cli/bin/ctxindex.mjs` and consumes public `@ctxindex/core/*` seams plus built-in Extensions.
- Submaps: `account/`, `action/`, `args/`, `artifact/`, `commands/`, `daemon/`, `describe/`, `docs/`, `extensions/`, `format/`, `oauth-app/`, `realm/`, `search/`, `skills/`, `source/`, `sync/`, and `thread/`.
