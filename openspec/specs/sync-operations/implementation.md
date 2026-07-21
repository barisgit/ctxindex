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
  readonly onProgress?: (progress: SyncRunProgress) => void | Promise<void>
}

export interface SyncRunProgress {
  readonly processed: number
  readonly upserts: number
  readonly removals: number
  readonly checkpoints: number
  readonly warningsCount: number
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
  readonly warningsCount: number
  readonly lastWarning: SyncWarning | null
  readonly errorsCount: number
  readonly warnings: readonly SyncWarning[]
}

export interface SyncRunFailureDiagnostics {
  readonly warningsCount: number
  readonly lastWarning: SyncWarning | null
  readonly errorsCount: 1
  readonly lastError: string
}

export function getSyncRunFailureDiagnostics(
  error: unknown,
): SyncRunFailureDiagnostics | null;

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
  readonly onProgress?: (progress: SyncRunProgress) => void | Promise<void>
  readonly fetch?: SourceProviderFetch
}

export function syncSource(input: SyncSourceInput): Promise<SyncRunResult>;
```

### @ctxindex/core — multi-Source application stream

```ts
export interface RunSyncInput {
  readonly source?: string
  readonly mode: SyncMode
  readonly signal: AbortSignal
  readonly onEvent?: (event: SyncApplicationEvent) => void | Promise<void>
}

export type SyncApplicationEvent =
  | { readonly type: 'source.started'; readonly sequence: number; readonly sourceId: string; readonly mode: SyncMode }
  | ({ readonly type: 'source.progress'; readonly sequence: number; readonly sourceId: string } & SyncRunProgress)
  | { readonly type: 'source.completed'; readonly sequence: number; readonly sourceId: string; readonly run: SyncRunResult }
  | { readonly type: 'source.failed'; readonly sequence: number; readonly sourceId: string; readonly error: CtxindexError; readonly diagnostics: SyncRunFailureDiagnostics }
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

Warnings may stream without invalidating committed state. `SyncCoordinator` is the severity boundary: it aggregates warning emissions independently, retains the original last structured warning at runtime, persists a field-bounded snapshot, and records a terminal thrown failure as one error without discarding earlier warnings. After each validated Adapter emission it awaits an optional observer with cumulative count-only progress; observer backpressure therefore reaches the Adapter's awaited `emit` call. Progress is an observation of processed emissions, not a committed-state claim. `SyncApplicationService` wraps one or many Source runs with deterministic, monotonically sequenced start/progress/terminal events and awaits the optional observer. Omitting observers preserves the same result and storage behavior.

A lock-conflicted attempt records its own run as failed `sync busy`; only explicit cancellation records a cancelled run. Failed-run diagnostics are associated with the original thrown object through a bounded weak channel, preserving error identity and exit translation while allowing the invoking CLI to report the summary. Diff mode exercises the same validation and rolls back data/cursor changes, including current Source sync state. CLI sync orchestration selects Sources, excludes stored `sync_enabled: false` Sources from all-Source runs, rejects a targeted disabled Source before invoking `syncSource`, invokes injected services, and keeps per-Source success/failure output deterministic.

The thin CLI owns the closed sync argv grammar and preserves help precedence. The root boundary rejects option-like tokens placed before the selected `sync` command before command selection can discard them, while preserving valid global options. The command descriptor forwards mode as an unvalidated string so the parser remains the sole mode-value boundary after command selection. The parser rejects invalid input through the `SyncArgs` union before runtime dependencies open, Source labels resolve, sync execution begins, or storage and provider effects become reachable.

## Verification

Emission and coordinator tests cover validation, checkpoints, warning-only aggregation, last-warning retention across terminal failure, cancellation, locking, rollback, tombstones, and run summaries. Source sync tests cover registry/auth/provider-context binding. CLI sync tests cover strict argument rejection before side effects, selection including disabled-Source all-run exclusion and targeted zero-provider failure, concurrency output, JSON/readable streams, warning-only success, and partial failure.
