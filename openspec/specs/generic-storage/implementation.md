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

Core exclusively owns SQLite/Drizzle schema, migrations, `ResourceStore`, and `RelationStore`; Adapters own no tables. Resource upserts validate through the loaded Profile and transactionally replace derived fields, chunks, Relations, and Artifact descriptors. Synced rows participate in reconciliation/tombstones; ad-hoc rows are cache materializations.

`field_index` stores one native TEXT, REAL, or INTEGER value per scalar/array ordinal. Logical Relations and cached zero-to-many resolutions stay separate. Ref suffixes are validated and preserved byte-for-byte without core assigning provider meaning.

## Verification

Schema, migrator, `ResourceStore`, and `RelationStore` tests cover fresh bootstrap, typed-value checks, projection replacement, Ref/source consistency, Relation resolution, and synced/ad-hoc lifecycle. Integration tests use a fresh sandbox database.
