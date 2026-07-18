# apps/cli/src/

## Responsibility

Implements the CLI application layer: registers the citty command tree, parses argv, composes core services, delegates domain work, and renders stable output and exit codes.

## Design / patterns

- `main.ts` is the composition root. It registers explicit `client`, `account`, and `source` lifecycle commands; the removed `auth` command is neither registered nor aliased.
- `args/` is pure parsing, `commands/` is the thin citty adapter layer, workflow folders own multi-step orchestration, and `format/` owns presentation and exit mapping.
- `deps.ts` constructs one shared secret runtime and wires `OAuthClientService`, `AuthService`, `AccountService`, `SourceService`, registry, and provider-operation services.
- `definitions.ts` loads configured Extensions; `describe` and generated Source options derive runtime truth from those registries, and human-readable Action descriptions retain strict `oneOf`/`anyOf` input branches.
- `extensions/` exposes explicit trusted Git Catalog lifecycle commands while core owns acquisition, persistence, and install behavior; Catalog list/show/install refresh by default and accept `--no-refresh`, while `definitions.ts` includes installed provenance in offline registry loading.

## Data & control flow

1. `runCli()` extracts global options and dispatches through `rootCommand`.
2. `client add --from-env` validates a loaded OAuth provider before reading declared environment names, then persists typed secret refs and metadata.
3. `account add` resolves one persisted same-provider client, requests all loaded same-provider Adapter scopes, and creates or updates one stable Grant; `account remove` clears bound Source grants and deletes Account/Grant state.
4. `source` commands accept required global labels; sync, status, search, Action, and removal accept a Source label or ID and resolve the stable ID before core execution.
5. Registry Action inputs flow through `format/`, which expands strict alternatives into numbered text or Markdown branches and renders each branch's required fields and constraints; this exposes the standalone and threaded-reply Draft shapes without provider-specific CLI commands.
6. Catalog add and core refresh acquire immutable Git snapshots; Catalog list/show/install invoke refresh by default, while their `--no-refresh` forms and all startup definition loading use persisted snapshots offline. Results include stored acquisition time and derived age through `format/`; failures flow through `mapErrorToExit` / `runWithExit`.

## Integration points

- Executed by `apps/cli/bin/ctxindex.mjs` and consumes public `@ctxindex/core/*` seams plus built-in Extensions.
- Submaps: `account/`, `action/`, `args/`, `artifact/`, `client/`, `commands/`, `extensions/`, `format/`, `skills/`, `source/`, and `sync/`.
