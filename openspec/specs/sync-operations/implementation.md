# Sync Operations Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/extension-sdk — sync contracts

```ts
export type SyncMode = 'sync' | 'resync' | 'diff'

export interface RetrievedResource<TPayload = unknown> {
  readonly ref: string
  readonly profile: ProfileReference
  readonly title?: string | null
  readonly summary?: string | null
  readonly occurredAt?: number | null
  readonly providerUpdatedAt?: number | null
  readonly payload: TPayload
}

export interface SyncedResource<TPayload = unknown>
  extends RetrievedResource<TPayload> {
  readonly completeness: 'partial' | 'complete'
}

export type SyncEmission =
  | { readonly type: 'upsertResource'; readonly resource: SyncedResource }
  | { readonly type: 'removeResource'; readonly ref: string }
  | { readonly type: 'checkpoint'; readonly cursor: unknown }
  | {
      readonly type: 'warning'
      readonly code: string
      readonly message: string
      readonly ref?: string
    }

export interface SyncContext extends ProviderContext {
  readonly cursor: unknown | null
  readonly mode: SyncMode
  readonly signal: AbortSignal
  readonly emit: (operation: SyncEmission) => void | Promise<void>
}
```

### @ctxindex/core — sync coordination

```ts
export interface SyncRunInput {
  readonly sourceId: string
  readonly mode: SyncMode
  readonly signal: AbortSignal
}

export interface SyncDriveContext {
  readonly cursor: unknown | null
  readonly mode: SyncMode
  readonly signal: AbortSignal
  readonly emit: (emission: SyncEmission) => void | Promise<void>
}

export type SyncDrive = (context: SyncDriveContext) => void | Promise<void>

export interface SyncWarning {
  readonly code: string
  readonly message: string
  readonly ref?: string
}

export interface SyncRunResult {
  readonly runId: string
  readonly mode: SyncMode
  readonly status: 'completed'
  readonly added: number
  readonly updated: number
  readonly deleted: number
  readonly errorsCount: number
  readonly warnings: readonly SyncWarning[]
}

export interface SyncCoordinatorOptions {
  readonly isProcessAlive?: (pid: number) => boolean
}

export class SyncCoordinator {
  constructor(
      private readonly db: CtxindexDatabase,
      profiles: ProfileRegistry,
      options: SyncCoordinatorOptions = {},
    );
  async run(input: SyncRunInput, drive: SyncDrive): Promise<SyncRunResult>;
}
```

### @ctxindex/core — emission validation

```ts
export function parseSyncEmission(value: unknown): SyncEmission;
```

### @ctxindex/core — Source sync execution

```ts
export interface SyncSourceInput {
  readonly db: CtxindexDatabase
  readonly registry: ExtensionRegistry
  readonly authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'>
  readonly logger: Parameters<typeof createSourceProviderContext>[0]['logger']
  readonly sourceId: string
  readonly mode: SyncMode
  readonly signal: AbortSignal
  readonly fetch?: SourceProviderFetch
}

export function syncSource(input: SyncSourceInput): Promise<SyncRunResult>;
```

### @ctxindex/cli — sync command boundary

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

export type SyncDeps = Pick<
  CliDeps,
  'db' | 'registry' | 'authService' | 'logger' | 'sourceService' | 'close'
>

export interface SyncServices {
  readonly syncSource: typeof syncSource
}

export async function handleSyncCommand(
  args: string[],
  open: OpenSyncDeps = openDeps,
  services: SyncServices = defaultServices,
): Promise<number>;
```

## Implementation doctrine

The SDK exposes cursor-driven emissions through `SyncContext`; there is no separate emit capability. Core `SyncCoordinator` validates emissions, owns run/lock/checkpoint state, buffers transactional writes, and applies cursor changes only with successful work. `syncSource` binds a stored Source to its loaded Adapter and provider context.

Warnings may stream without invalidating committed state. Diff mode exercises the same validation and rolls back data/cursor changes. CLI sync orchestration selects Sources, invokes injected services, and keeps per-Source success/failure output deterministic.

The thin CLI owns the closed sync argv grammar and preserves help precedence. The root boundary rejects option-like tokens placed before the selected `sync` command before command selection can discard them, while preserving valid global options. The command descriptor forwards mode as an unvalidated string so the parser remains the sole mode-value boundary after command selection. The parser rejects invalid input through the `SyncArgs` union before runtime dependencies open, Source labels resolve, sync execution begins, or storage and provider effects become reachable.

## Verification

Emission and coordinator tests cover validation, checkpoints, warnings, cancellation, locking, rollback, tombstones, and run summaries. Source sync tests cover registry/auth/provider-context binding. CLI sync tests cover strict argument rejection before side effects, selection, concurrency output, JSON/readable streams, and partial failure.
