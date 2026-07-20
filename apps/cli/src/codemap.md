# apps/cli/src/

## Responsibility

Implements the CLI application layer: registers the citty command tree, parses argv, composes core services, delegates domain work, and renders stable output and exit codes.

## Design / patterns

- `main.ts` is the composition root. It registers explicit `oauth-app`, `account`, and `source` lifecycle commands; removed `client` and `auth` commands are neither registered nor aliased.
- `args/` is pure parsing, `commands/` is the thin citty adapter layer, workflow folders own multi-step orchestration, and `format/` owns presentation and exit mapping.
- `deps.ts` constructs one shared secret runtime and wires `OAuthAppService`, `AuthService`, `AccountService`, `SourceService`, complete registry, and provider-operation services.
- `definitions.ts` loads configured Extensions and renders only host-generated safe diagnostics, discarding arbitrary import/evaluation causes while retaining separately rendered path provenance; `describe` and generated Source options derive runtime truth from those registries, and human-readable Action descriptions retain strict `oneOf`/`anyOf` input branches.
- `extensions/` exposes explicit trusted Git Catalog lifecycle commands while core owns acquisition, persistence, and install behavior; Catalog list/show/install refresh by default and accept `--no-refresh`, while `definitions.ts` includes installed provenance in offline registry loading.

## Data & control flow

1. `runCli()` extracts global options and dispatches through `rootCommand`.
2. `oauth-app add --from-env` validates a loaded OAuth Provider before reading its declared registration environment names, then persists typed config refs and safe metadata.
3. `account add --app` resolves one exact same-provider App, requests all loaded same-provider Adapter access scopes, and creates or updates one stable Grant with a private App-config snapshot; `account remove` clears bound Source grants and deletes Account/Grant state.
4. `source` commands accept required global labels; sync, status, search, Action, and removal accept a Source label or ID and resolve the stable ID before core execution.
5. Registry Action inputs flow through `format/`, which expands strict alternatives into numbered text or Markdown branches and renders each branch's required fields and constraints; this exposes the standalone and threaded-reply Draft shapes without provider-specific CLI commands.
6. Catalog add and core refresh acquire immutable Git snapshots; Catalog list/show/install invoke refresh by default, while their `--no-refresh` forms and all startup definition loading use persisted snapshots offline. Results include stored acquisition time and derived age through `format/`; failures flow through `mapErrorToExit` / `runWithExit`.

## Integration points

- Executed by `apps/cli/bin/ctxindex.mjs` and consumes public `@ctxindex/core/*` seams plus built-in Extensions.
- Submaps: `account/`, `action/`, `args/`, `artifact/`, `oauth-app/`, `commands/`, `extensions/`, `format/`, `skills/`, `source/`, and `sync/`.
