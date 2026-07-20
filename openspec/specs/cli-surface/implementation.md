# CLI Surface Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/cli — service dependencies

```ts
export interface CliDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
  readonly env: ReturnType<typeof getEnv>
  readonly realmService: RealmService
  readonly sourceService: SourceService
  readonly secretBackendManager: SecretBackendManager
  readonly secretVault: SecretVault
  readonly authService: AuthService
  readonly oauthAppService: OAuthAppService
  readonly registry: ExtensionRegistry
  readonly completeRegistry: CompleteRegistry
  readonly threadService: ThreadService
  readonly artifactService: ArtifactService
  close(): Promise<void>
}

export interface AccountCliDeps {
  readonly accountService: AccountService
  close(): Promise<void>
}

export interface SecretCliDeps {
  readonly secretBackendManager: SecretBackendManager
  close(): Promise<void>
}

export async function assertInitialized(): Promise<void>;

export async function openDeps(
  opts: {
    readonly config?: CtxindexConfig
    readonly definitions?: CliDefinitions
    readonly databaseOwnership?: DirectDatabaseOwnership
  } = {},
): Promise<CliDeps>;
```

### @ctxindex/cli — loaded definitions

```ts
export interface CliDefinitions extends LoadExtensionsResult {
  readonly config: CtxindexConfig
  readonly description: RegistryDescription
}

export interface LoadCliDefinitionsOptions {
  readonly config?: CtxindexConfig
  readonly localOAuthAppIdentities?: readonly OAuthAppIdentity[]
}

export async function loadCliDefinitions(
  options: LoadCliDefinitionsOptions = {},
): Promise<CliDefinitions>;

```

`LoadExtensionsResult` includes core's passive Extension documentation projection, but current CLI command registration and bundled skills do not render, list, or inline it. Bundled skills remain release-versioned workflow guidance; registry descriptions remain authoritative for interface facts. A CLI or agent presentation surface for Extension documentation requires a separately accepted consumer contract.

### @ctxindex/cli — composition boundary

```ts
export async function runCli(args: string[]): Promise<number>;
```

### @ctxindex/cli — shared flag contracts

```ts
export type FlagValue = boolean | string | readonly string[]

export type ParseFlagsError =
  | { readonly kind: 'unknown'; readonly flag: string }
  | { readonly kind: 'duplicate'; readonly flag: string }
  | { readonly kind: 'missing-value'; readonly flag: string }

export interface ParsedFlags {
  readonly flags: Record<string, FlagValue>
  readonly positional: string[]
  readonly error?: ParseFlagsError
}

export interface ParseFlagsOptions {
  readonly booleanFlags?: readonly string[]
  readonly valueFlags?: readonly string[]
  readonly strict?: boolean
}

export function parseFlags(
  args: string[],
  options: ParseFlagsOptions = {},
): ParsedFlags;

```

### @ctxindex/cli — Account arguments

```ts
export type AccountArgs =
  | {
      readonly kind: 'add'
      readonly provider: string
      readonly app?: string
      readonly label?: string
    }
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'remove'; readonly label: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseAccountArgs(args: string[]): AccountArgs;
```

### @ctxindex/cli — Action arguments

```ts
export type ActionArgs =
  | {
      readonly kind: 'describe'
      readonly actionId: string
      readonly sourceId?: string
      readonly json: boolean
    }
  | {
      readonly kind: 'run'
      readonly actionId: string
      readonly sourceId: string
      readonly input: string
      readonly json: boolean
      readonly confirmIrreversible: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseActionArgs(args: string[]): ActionArgs;
```

### @ctxindex/cli — Artifact arguments

```ts
export type ArtifactListArgs =
  | { readonly kind: 'list'; readonly ref: string; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export type ArtifactDownloadArgs =
  | {
      readonly kind: 'download'
      readonly ref: string
      readonly outputPath?: string | undefined
      readonly json: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseArtifactListArgs(args: string[]): ArtifactListArgs;

export function parseArtifactDownloadArgs(
  args: string[],
): ArtifactDownloadArgs;
```

### @ctxindex/cli — OAuth App arguments

```ts
export type OAuthAppArgs =
  | {
      readonly kind: 'add'
      readonly provider: string
      readonly label: string
      readonly fromEnv: true
    }
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'remove'
      readonly provider: string
      readonly label: string
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseOAuthAppArgs(args: string[]): OAuthAppArgs;
```

### @ctxindex/cli — describe arguments

```ts
export type DescribeArgs =
  | {
      readonly kind: 'describe'
      readonly selector?: 'profile' | 'adapter' | 'action'
      readonly id?: string
      readonly format: 'text' | 'markdown' | 'json'
      readonly full: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseDescribeArgs(args: string[]): DescribeArgs;
```

### @ctxindex/cli — export arguments

```ts
export type ExportArgs =
  | { readonly kind: 'export'; readonly ref: string; readonly format: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseExportArgs(args: string[]): ExportArgs;
```

### @ctxindex/cli — Extension arguments

```ts
export interface ExtensionSelector {
  readonly id: string
  readonly version: number
}

export type ExtensionsArgs =
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'catalog-add'
      readonly name: string
      readonly repository: string
      readonly ref: string
      readonly trust: true
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-list'
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-show'
      readonly name: string
      readonly extension?: ExtensionSelector
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-refresh'
      readonly name: string
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-remove'
      readonly name: string
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-install'
      readonly catalog: string
      readonly extension: ExtensionSelector
      readonly trust: true
      readonly noRefresh: boolean
      readonly json: boolean
    }
  | {
      readonly kind: 'catalog-uninstall'
      readonly extension: ExtensionSelector
      readonly json: boolean
    }
  | {
      readonly kind: 'direct-install'
      readonly sourceKind: 'npm' | 'git' | 'local'
      readonly target: string
      readonly extensionId: string
      readonly json: boolean
    }
  | {
      readonly kind: 'direct-update'
      readonly extensionId: string
      readonly json: boolean
    }
  | {
      readonly kind: 'direct-uninstall'
      readonly extensionId: string
      readonly force: boolean
      readonly json: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseExtensionsArgs(args: string[]): ExtensionsArgs;
```

### @ctxindex/cli — retrieval arguments

```ts
export type GetArgs =
  | { readonly kind: 'get'; readonly ref: string; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseGetArgs(args: string[]): GetArgs;
```

### @ctxindex/cli — Realm arguments

```ts
export type RealmArgs =
  | { readonly kind: 'add'; readonly slug: string; readonly name?: string }
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseRealmArgs(args: string[]): RealmArgs;
```

### @ctxindex/cli — search arguments

```ts
export interface ExecuteSearchInput {
  readonly text?: string
  readonly realms?: readonly string[]
  readonly sourceIds?: readonly string[]
  readonly adapterId?: string
  readonly kind?: string
  readonly fields?: readonly { readonly name: string; readonly value: string }[]
  readonly since?: number
  readonly until?: number
  readonly limit?: number
  readonly offset?: number
  readonly explain?: boolean
  readonly localOnly?: boolean
  readonly remote?: boolean
}

export type SearchArgs =
  | {
      readonly kind: 'search'
      readonly input: ExecuteSearchInput
      readonly json: boolean
      readonly refs: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseSearchArgs(args: string[]): SearchArgs;
```

### @ctxindex/cli — secret arguments

```ts
export type SecretsArgs =
  | { readonly kind: 'status'; readonly json: boolean }
  | { readonly kind: 'set'; readonly target: SecretBackend }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseSecretsArgs(args: string[]): SecretsArgs;
```

### @ctxindex/cli — skill arguments

```ts
export type SkillsArgs =
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'get'
      readonly name: string
      readonly inline: boolean
      readonly json: boolean
    }
  | { readonly kind: 'path' }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseSkillsArgs(args: string[]): SkillsArgs;
```

### @ctxindex/cli — Source arguments

```ts
export type SourceArgs =
  | {
      readonly kind: 'add'
      readonly adapterId: string
      readonly realmSlug?: string
      readonly label?: string
      readonly configJson?: string
      readonly account?: string
      readonly searchRouting?: 'indexed' | 'federated' | 'hybrid'
    }
  | {
      readonly kind: 'list'
      readonly realmSlug?: string
      readonly json: boolean
      readonly format: 'table' | 'compact'
    }
  | { readonly kind: 'remove'; readonly sourceId: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseSourceArgs(
  args: string[],
  sources: readonly SourceDescription[] = [],
): SourceArgs;
```

### @ctxindex/cli — status arguments

```ts
export type StatusArgs =
  | {
      readonly kind: 'status'
      readonly sourceId?: string
      readonly json: boolean
      readonly format: 'summary' | 'compact'
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseStatusArgs(args: string[]): StatusArgs;
```

### @ctxindex/cli — sync arguments

```ts
export type SyncArgs =
  | {
      readonly kind: 'run'
      readonly sourceId?: string
      readonly mode: SyncMode
      readonly json: boolean
      readonly format: 'summary' | 'events' | 'compact'
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseSyncArgs(args: string[]): SyncArgs;
```

Sync, status, and Source inventory formatters project core-owned `warningsCount`, `lastWarning`, `errorsCount`, and `lastError` values directly. Failed sync formatting reads bounded diagnostics from core's failure channel while retaining the safe public error message and stable exit. The CLI labels the two severities independently in JSON and readable output and does not reconstruct severity from diagnostic text.

### @ctxindex/cli — thread arguments

```ts
export type ThreadGetArgs =
  | { readonly kind: 'get'; readonly ref: string; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseThreadGetArgs(args: string[]): ThreadGetArgs;
```

### @ctxindex/cli — purge arguments

```ts
export type PurgeArtifactsArgs =
  | { readonly kind: 'purge'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parsePurgeArtifactsArgs(args: string[]): PurgeArtifactsArgs;
```

## Implementation doctrine

`@ctxindex/cli` is the composition root. It opens core services, loads the current registry once per command flow, parses non-interactively, invokes deep-module services through focused handlers, and owns readable/JSON output plus exit mapping.

Database-backed command dependency setup requires both the persisted config and database created by explicit `init` before opening SQLite. The shared preflight fails with the fixed exit-2 guidance `ctxindex is not initialized; run ctxindex init` and no durable side effects when either is absent. OAuth App add preserves loaded-Provider validation, then invokes the preflight before declared configuration environments are read; list/remove check before dependencies. `init` retains backend selection before database bootstrap. Help, argument parsing, Provider validation, and pure definition discovery remain available on fresh state.

Parser unions are the command boundary. Registry-derived Source config, fields, kinds, exports, and Actions are resolved before service calls rather than duplicated as provider branches. The OAuth surface contains only `oauth-app` and `account` commands: App add requires exact Provider and label plus `--from-env`; Account add accepts an optional `--app`. An explicit label bypasses managed selection, while omission delegates to core's host-policy resolver and feeds the returned exact label through the same OAuth App service resolver. The CLI owns only this branch and static BYOA formatting; it does not infer Apps or reproduce policy, provenance, scope, or Provider logic. No `client` route or alias is parsed. Structured output writes safe projections to stdout and human diagnostics to stderr; App config, credential values, tokens, authorization codes, and secret-store passphrases never enter argv or output.

The Extension command adapter delegates repository, manifest, persistence, refresh policy, and Catalog install behavior to `CatalogService`. Direct lifecycle forms delegate target parsing, package materialization, validation, persistence, and removal guards to `DirectExtensionService`. The parser distinguishes exact `npm|git|local` source kinds from existing Catalog selectors, and install/update emit their in-process trust notice on stderr before acquisition so JSON stdout remains one document. Catalog list/show and install request refresh by default, while `--no-refresh` selects stored state. Startup, loaded-Extension listing, uninstall, and ordinary operations never cross either acquisition boundary.

## Verification

Argument tests cover every discriminated parser and invalid form, including optional managed App selection, explicit exact App labels, exact direct source-kind and Extension selection, Catalog/direct separation, zero-effect invalid selection, static BYOA guidance, and rejection of every Client compatibility route. Command tests inject dependency/service interfaces. CLI e2e tests cover empty and config-only initialization guards with no OAuth App configuration or durable-state side effects, readable/JSON stream separation, stable exits, registry-derived help/describe behavior, bundled skills, local Catalog trust, direct package trust, default command-time refresh, stored-snapshot age and `--no-refresh`, observable refresh failure, offline pinned startup/loading, guarded removal, and relocated compiled execution.
