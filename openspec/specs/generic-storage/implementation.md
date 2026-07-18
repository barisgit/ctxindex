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

`field_index` stores one native TEXT, REAL, or INTEGER value per scalar/array ordinal. Logical Relations and cached zero-to-many resolutions stay separate. Ref suffixes are validated and preserved byte-for-byte without core assigning provider meaning.

## Verification

Schema, migrator, `ResourceStore`, and `RelationStore` tests cover fresh bootstrap, bounded warning/error columns, typed-value checks, projection replacement, Ref/source consistency before deduplication, Relation resolution, synced/ad-hoc lifecycle, batch rollback, and typed bounded contention during setup, migration, and Resource writes. Integration tests use a fresh sandbox database.
