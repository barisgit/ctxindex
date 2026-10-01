# Generic Storage Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/core — database access

```ts
export type CtxindexDatabase = Database

export function databasePath(): string;

export async function openDatabase(
  path: string = databasePath(),
): Promise<CtxindexDatabase>;

export function applyPragmas(database: CtxindexDatabase): void;
```

### @ctxindex/local-daemon — retained file leases

```ts
export type FileLeaseMode = 'shared' | 'exclusive'
export type FileLeasePurpose = 'lifecycle' | 'database'

export interface FileLeaseRequest {
  readonly canonicalTarget: string
  readonly purpose: FileLeasePurpose
  readonly mode: FileLeaseMode
}

export interface FileLease {
  readonly mode: FileLeaseMode
  readonly targetDigest: string
  release(): void
}

export interface FileLeaseBackend {
  acquire(input: FileLeaseRequest): FileLease
}

export function createFileLeaseBackend(
  options?: FileLeaseBackendOptions,
): FileLeaseBackend;

export function assertRetainedDatabaseLeaseTarget(lease: FileLease): void;

export class FileLeaseConflictError extends Error {
  readonly targetDigest: string
}

export class FileLeaseUnsupportedError extends Error {
  readonly reason: 'platform' | 'primitive' | 'filesystem'
}

export class UnsafeFileLeaseError extends Error {}
```

### @ctxindex/core — schema migration

```ts
export async function runMigrations(db: CtxindexDatabase): Promise<void>;
```

### @ctxindex/core — storage bootstrap

```ts
export async function bootstrapDatabase(): Promise<void>;
```

### @ctxindex/core — Resource persistence

```ts
export type ResourceOrigin = 'synced' | 'adhoc'

export interface ResourceUpsert {
  readonly ref: string
  readonly sourceId: string
  readonly profile: ProfileReference
  readonly origin: ResourceOrigin
  readonly completeness: 'partial' | 'complete'
  readonly title?: string | null
  readonly summary?: string | null
  readonly occurredAt?: number | null
  readonly providerUpdatedAt?: number | null
  readonly payload?: unknown
}

export interface ResourceUpsertResult {
  readonly resourceId: string
  readonly warnings: readonly UnknownProfileWarning[]
}

export interface ResourceRemoval {
  readonly ref: string
  readonly sourceId: string
  readonly deletedAt: number
}

export interface StoredResource {
  readonly id: string
  readonly ref: string
  readonly sourceId: string
  readonly realmId: string
  readonly profile: ProfileReference
  readonly origin: ResourceOrigin
  readonly title: string | null
  readonly summary: string | null
  readonly occurredAt: number | null
  readonly providerUpdatedAt: number | null
  readonly deletedAt: number | null
  readonly hydratedAt: number | null
  readonly payload: unknown | null
  readonly createdAt: number
  readonly updatedAt: number
}

export class ResourceStore {
  constructor(
      private readonly db: CtxindexDatabase,
      private readonly profiles: ProfileRegistry,
    );
  upsert(input: ResourceUpsert): ResourceUpsertResult;
  upsertMany(
      inputs: readonly ResourceUpsert[],
    ): readonly ResourceUpsertResult[];
  get(
      ref: string,
      options: { readonly includeDeleted?: boolean } = {},
    ): StoredResource | null;
  remove(input: ResourceRemoval): void;
}
```

### @ctxindex/core — Relation persistence

```ts
export type RelationTarget = ProfileRelationTarget

export interface RelationWrite {
  readonly relation: string
  readonly target: RelationTarget
}

export interface StoredRelation extends RelationWrite {
  readonly id: string
  readonly sourceResourceId: string
  readonly resolvedResourceIds: readonly string[]
}

export interface TraversalResult {
  readonly resourceId: string
  readonly direction: 'outgoing' | 'incoming'
}

export class RelationStore {
  constructor(private readonly db: CtxindexDatabase);
  replace(sourceResourceId: string, relations: readonly RelationWrite[]): void;
  list(sourceResourceId: string): readonly StoredRelation[];
  traverse(
      resourceId: string,
      relation: string,
      direction: 'outgoing' | 'incoming' | 'both' = 'both',
      options: { readonly includeDeleted?: boolean } = {},
    ): readonly TraversalResult[];
}
```

## Implementation doctrine

Core exclusively owns SQLite/Drizzle schema, migrations, `ResourceStore`, and `RelationStore`; Adapters own no tables. Resource upserts validate through the loaded Profile and transactionally replace derived fields, chunks, and Relations. Profiles derive Artifact descriptors on demand from the validated Resource payload; cached Artifact-byte metadata is written only by the download path. Synced rows participate in reconciliation/tombstones; ad-hoc rows are cache materializations.

SQLite coordinates writers across processes. One core storage normalizer classifies busy and locked result families for database open/setup, migrations, and Resource batches, retaining the backend exception only as the typed error's cause. Database setup installs the five-second busy timeout before lock-sensitive pragmas. `ResourceStore.upsertMany()` validates every Ref and Source association before collapsing repeated valid Refs to their final input state, reserves the writer with one immediate transaction, and commits or rolls back every Resource envelope and derived projection together; `upsert()` shares that path for one Resource.

Core sync bookkeeping stores bounded diagnostics on both historical Sync Runs and current Source sync state. Warning state is a count plus nullable JSON for one `SyncWarning`; error state is a count plus one nullable bounded last error. Core owns serialization and defensive parsing, and no diagnostic history table or Adapter-owned diagnostic storage exists. Runtime sync results retain the original warning.

Exactly one retained owner opens the canonical SQLite database. Callers acquire a `FileLeaseBackend` lease for the canonical database target before open and retain it across the complete open/use/close lifetime: the daemon holds it exclusively from before SQLite open until after close, including drain and shutdown timeout, and allowlisted direct openers hold it shared over their own open/use/close. `assertRetainedDatabaseLeaseTarget()` rechecks the retained target immediately around open. Ownership comes only from the retained kernel lock, never from lock-file contents or PID metadata. Lease files are permanent owner-private `0600` regular files beside their target (`<databasePath>.owner.lock`, `<stateRoot>/daemon/lifecycle.owner.lock`) and are never unlinked; symlinked, hard-linked, foreign-owned, non-private, or substituted targets fail closed. Canonicalization precedes acquisition so path aliases contend on one identity. Conflicts are holder-neutral, and an unsupported platform or filesystem fails before SQLite opens.

`createFileLeaseBackend()` is the injected platform boundary: callers depend only on acquire/release and the typed failures, and no CLI or daemon module contains platform lock constants or system calls. Darwin uses retained `O_SHLOCK`/`O_EXLOCK | O_NONBLOCK` descriptors. Linux opens and validates the permanent lease file, then takes a non-blocking shared or exclusive `flock(2)` lock on that open file description by running a trusted system `flock(1)` (`-n -E 73 -s|-x 3`) with the retained descriptor passed as fd 3; the lock belongs to the description the process keeps, so it lasts until `FileLease.release()` closes it or the process dies, and kernel cleanup after SIGKILL or a crash allows immediate reacquisition. The helper must resolve to an absolute, root-owned, non-group/world-writable executable at a fixed system location; a missing or untrusted helper reports `FileLeaseUnsupportedError('primitive')`, exit `73` is the holder-neutral conflict, and any other helper result fails closed as an unsupported filesystem. The file and target are revalidated after locking. Any other platform, including Windows, throws `FileLeaseUnsupportedError('platform')` at backend selection. Only `'platform'` means no daemon can own the database, so only it lets an allowlisted direct opener continue unleased; `'primitive'` and `'filesystem'` occur on a platform where a daemon could still own the database, so they fail closed with exit `50` before SQLite opens.

`field_index` stores one native TEXT, REAL, or INTEGER value per scalar/array ordinal. Logical Relations and cached zero-to-many resolutions stay separate. Ref suffixes are validated and preserved byte-for-byte without core assigning provider meaning.

## Verification

`packages/local-daemon/src/lease.test.ts` runs the platform-parametric lease matrix (contention, aliases, private permanent files, unsafe-target rejection, holder-neutral conflicts, release on close and SIGKILL, immediate reacquisition, no unlink, lifecycle/database separation); `apps/daemon/src/runtime-lease.test.ts` proves fail-closed startup before SQLite open and ownership from before open until after close; `apps/daemon/src/e2e/compiled-lease.e2e.test.ts` repeats the multi-process gates with packaged executables on both Darwin and Linux. `apps/cli/src/direct-database.test.ts` proves that a missing Linux helper fails closed before the SQLite file is created while only an unsupported OS keeps unleased direct access.

Schema, migrator, `ResourceStore`, and `RelationStore` tests cover fresh bootstrap, bounded warning/error columns, typed-value checks, projection replacement, Ref/source consistency before deduplication, Relation resolution, synced/ad-hoc lifecycle, batch rollback, and typed bounded contention during setup, migration, and Resource writes. Integration tests use a fresh sandbox database.
