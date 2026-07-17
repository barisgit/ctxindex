# CLI Surface Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `apps/cli/src/deps.ts`

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
  readonly oauthClientService: OAuthClientService
  readonly registry: ExtensionRegistry
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

export async function openAccountDeps(): Promise<AccountCliDeps>;

export async function openSecretDeps(): Promise<SecretCliDeps>;

export async function openDeps(
  opts: {
    readonly config?: CtxindexConfig
    readonly registry?: ExtensionRegistry
  } = {},
): Promise<CliDeps>;
```

### `apps/cli/src/definitions.ts`

```ts
export interface CliDefinitions extends LoadExtensionsResult {
  readonly config: CtxindexConfig
  readonly description: RegistryDescription
}

export async function loadCliDefinitions(): Promise<CliDefinitions>;

export function printExtensionDiagnostics(
  diagnostics: CliDefinitions['diagnostics'],
): void;

export function redactExtensionDiagnostic(
  message: string,
  canary = getEnv().CTXINDEX_LOG_CANARY_TOKEN,
): string;
```

### `apps/cli/src/main.ts`

```ts
export async function runCli(args: string[]): Promise<number>;
```

### `apps/cli/src/args/flags.ts`

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

export function hasHelpFlag(args: string[]): boolean;

export function stringFlag(
  flags: Record<string, FlagValue>,
  key: string,
): string | undefined;

export function listFlag(
  flags: Record<string, FlagValue>,
  key: string,
): readonly string[];
```

### `apps/cli/src/args/account.ts`

```ts
export type AccountArgs =
  | {
      readonly kind: 'add'
      readonly provider: string
      readonly label?: string
      readonly client?: string
    }
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'remove'; readonly label: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseAccountArgs(args: string[]): AccountArgs;
```

### `apps/cli/src/args/action.ts`

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

### `apps/cli/src/args/artifact.ts`

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

### `apps/cli/src/args/client.ts`

```ts
export type ClientArgs =
  | { readonly kind: 'add'; readonly provider: string; readonly label?: string }
  | { readonly kind: 'list' }
  | {
      readonly kind: 'remove'
      readonly provider: string
      readonly label: string
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseClientArgs(args: string[]): ClientArgs;
```

### `apps/cli/src/args/describe.ts`

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

### `apps/cli/src/args/export.ts`

```ts
export type ExportArgs =
  | { readonly kind: 'export'; readonly ref: string; readonly format: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseExportArgs(args: string[]): ExportArgs;
```

### `apps/cli/src/args/extensions.ts`

```ts
export type ExtensionsArgs =
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseExtensionsArgs(args: string[]): ExtensionsArgs;
```

### `apps/cli/src/args/get.ts`

```ts
export type GetArgs =
  | { readonly kind: 'get'; readonly ref: string; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseGetArgs(args: string[]): GetArgs;
```

### `apps/cli/src/args/realm.ts`

```ts
export type RealmArgs =
  | { readonly kind: 'add'; readonly slug: string }
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseRealmArgs(args: string[]): RealmArgs;
```

### `apps/cli/src/args/search.ts`

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

### `apps/cli/src/args/secrets.ts`

```ts
export type SecretsArgs =
  | { readonly kind: 'status'; readonly json: boolean }
  | { readonly kind: 'set'; readonly target: SecretBackend }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseSecretsArgs(args: string[]): SecretsArgs;
```

### `apps/cli/src/args/skills.ts`

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

### `apps/cli/src/args/source.ts`

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

### `apps/cli/src/args/status.ts`

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

### `apps/cli/src/args/sync.ts`

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

### `apps/cli/src/args/thread-get.ts`

```ts
export type ThreadGetArgs =
  | { readonly kind: 'get'; readonly ref: string; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseThreadGetArgs(args: string[]): ThreadGetArgs;
```

### `apps/cli/src/args/purge.ts`

```ts
export type PurgeArtifactsArgs =
  | { readonly kind: 'purge'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parsePurgeArtifactsArgs(args: string[]): PurgeArtifactsArgs;
```

## Implementation doctrine

`apps/cli/src/main.ts` is the composition root. `deps.ts` opens core services; `definitions.ts` loads the current registry once per command flow; `args/*` owns non-interactive parsing; focused handlers invoke deep-module services; `format/*` owns readable/JSON output and exit mapping.

Parser unions are the command boundary. Registry-derived Source config, fields, kinds, exports, and Actions are resolved before service calls rather than duplicated as provider branches. Structured output writes data to stdout and human diagnostics to stderr; credential values and secret-store passphrases never enter argv.

## Verification

Argument tests cover every discriminated parser and invalid form. Command tests inject dependency/service interfaces. CLI e2e tests cover readable/JSON stream separation, stable exits, registry-derived help/describe behavior, bundled skills, and relocated compiled execution.
