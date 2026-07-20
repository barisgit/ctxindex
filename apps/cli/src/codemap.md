# apps/cli/src/

## Responsibility

Implements the CLI application layer: registers the citty command tree, parses argv, composes core services, delegates domain work, and renders stable output and exit codes.

## Design / patterns

- `main.ts` is the composition root. It registers explicit `oauth-app`, `account`, and `source` lifecycle commands plus the foreground-only daemon lifecycle surface; removed `client` and `auth` commands remain absent. Its root-command version comes from build-time `__CTXINDEX_VERSION__`, with `0.0.0` as the unbundled fallback.
- `args/` is pure parsing, `commands/` is the thin citty adapter layer, workflow folders own multi-step orchestration, and `format/` owns presentation and exit mapping.
- `commands/db.ts` owns explicit-initialization preflight, while `direct-database.ts` owns retained shared-lease fencing from before direct Extension loading through optional read-only local OAuth App identity discovery, open/migrate, and close; initialization and Extension-install identity preflight use the same fence. `deps.ts` can compose production services from the exact preloaded definition snapshot and retained owner rather than opening or loading again. `daemon/` owns selection and transport without importing the daemon app.
- `definitions.ts` loads configured Extensions and renders only host-generated safe diagnostics; registry descriptions and generated Source options derive runtime truth, and Action descriptions retain strict input alternatives.
- `extensions/` exposes explicit trusted Git Catalog lifecycle commands while core owns acquisition, persistence, and install behavior; Catalog list/show/install refresh by default and accept `--no-refresh`, while `definitions.ts` includes installed provenance in offline registry loading.

## Data & control flow

1. `runCli()` extracts global options, builds one per-invocation command tree, and dispatches through it; Source argument generation and execution share one retained route decision, direct owner, and definition projection, and invocation-final cleanup releases ownership even when Citty rejects generated argv before the handler runs.
2. Database-backed flows require explicit `init`; `oauth-app add --from-env` acquires direct ownership before Extension imports, validates one loaded OAuth Provider snapshot before reading its declared registration environment names, and persists typed config refs through that same retained owner.
3. `account add` opens one retained direct dependency lifetime and either asks core to match one exact managed App against host-owned bundled policy or bypasses policy for an explicit `--app` label. Both paths use the ordinary exact same-provider resolver and create or update one stable Grant with a private App-config snapshot; unavailable/ambiguous managed selection fails before authorization with BYOA guidance, and removal clears bound Source grants.
4. Realm/Source management, sync, status, search, exact get, and thread get select daemon RPC only from exact-tuple metadata or a test override and never fall back after selection; without a selector they retain the direct core path behind shared database ownership. Remaining SQLite-backed commands use the retained direct opener, and `init` uses the same lease fence.
5. Registry Action inputs flow through `format/`, which expands strict alternatives into numbered text or Markdown branches and renders each branch's required fields and constraints; this exposes the standalone and threaded-reply Draft shapes without provider-specific CLI commands.
6. Catalog add and core refresh acquire immutable Git snapshots; Catalog list/show/install invoke refresh by default, while their `--no-refresh` forms and all startup definition loading use persisted snapshots offline. Install first reads local OAuth App identities behind the shared database lease and therefore fails before Catalog work while a daemon owns SQLite. Results include stored acquisition time and derived age through `format/`; failures flow through `mapErrorToExit` / `runWithExit`.

## Integration points

- Executed by `apps/cli/bin/ctxindex.mjs` and consumes public `@ctxindex/core/*` seams plus built-in Extensions.
- Submaps: `account/`, `action/`, `args/`, `artifact/`, `oauth-app/`, `commands/`, `daemon/`, `extensions/`, `format/`, `realm/`, `search/`, `skills/`, `source/`, `sync/`, and `thread/`.
