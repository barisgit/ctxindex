# Retrieval and Artifacts Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/core — provider retrieval

```ts
export interface SourceResourceWarning {
  readonly code: string
  readonly message: string
  readonly ref: string
}

export interface SourceResourceResult {
  readonly resource: StoredResource
  readonly warnings: readonly SourceResourceWarning[]
}

export interface RetrieveSourceResourceInput
  extends Omit<CreateSourceProviderContextInput, 'sourceId'> {
  readonly ref: string
  readonly signal: AbortSignal
}

export async function retrieveSourceResource(
  input: RetrieveSourceResourceInput,
): Promise<SourceResourceResult>;

export async function getSourceResource(
  input: RetrieveSourceResourceInput,
): Promise<SourceResourceResult>;
```

### @ctxindex/core — Artifact persistence

```ts
export interface ArtifactMetadataInput {
  readonly ref: string
  readonly originRef: string
  readonly mediaType: string
  readonly byteSize?: number | undefined
  readonly retentionClass: 'cached'
}

export interface ArtifactPurgeResult {
  readonly artifactCountRemoved: number
  readonly objectCountRemoved: number
  readonly logicalBytesFreed: number
  readonly physicalBytesFreed: number
  readonly diskAccounting: ArtifactDiskAccounting
}

export interface Artifact {
  readonly ref: string
  readonly originRef: string
  readonly contentHash: string
  readonly mediaType: string
  readonly byteSize: number
  readonly retentionClass: 'cached'
  readonly localPath: string
  readonly createdAt: number
}

export interface ArtifactWriter {
  write(bytes: Uint8Array): Promise<void>
  commit(metadata: ArtifactMetadataInput): Promise<Artifact>
  abort(): Promise<void>
}

export interface ArtifactStoreOptions {
  readonly root?: string
  readonly clock?: () => number
  readonly purgeId?: () => string
}

export interface ArtifactDiskAccounting {
  readonly artifactCount: number
  readonly objectCount: number
  readonly logicalBytes: number
  readonly physicalBytes: number
}

export class ArtifactStore {
  readonly root: string
  constructor(
      private readonly db: CtxindexDatabase,
      options: ArtifactStoreOptions = {},
    );
  async write(
      metadata: ArtifactMetadataInput,
      produce: (writer: ArtifactWriter) => Promise<void>,
    ): Promise<Artifact>;
  async createWriter(): Promise<ArtifactWriter>;
  async get(ref: string): Promise<Artifact | undefined>;
  async read(ref: string, maxByteSize?: number): Promise<
    { readonly artifact: Artifact; readonly bytes: Uint8Array } | undefined
  >;
  async copyTo(ref: string, outputPath: string): Promise<void>;
  async purge(): Promise<ArtifactPurgeResult>;
  async diskAccounting(): Promise<ArtifactDiskAccounting>;
}
```

### @ctxindex/core — Artifact service boundary

```ts
export interface ArtifactWarning {
  readonly code: string
  readonly message: string
  readonly ref: string
}

export interface ArtifactListResult {
  readonly resourceRef: string
  readonly artifacts: readonly ArtifactDescriptor[]
  readonly warnings: readonly ArtifactWarning[]
}

export type DownloadedArtifact = Omit<Artifact, 'localPath'>

export interface ArtifactDownloadResult {
  readonly artifact: DownloadedArtifact
  readonly cache: 'hit' | 'miss'
  readonly outputPath?: string | undefined
}

export interface ArtifactServiceInput {
  readonly db: CtxindexDatabase
  readonly registry: ExtensionRegistry
  readonly authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'>
  readonly logger: Parameters<typeof createSourceProviderContext>[0]['logger']
  readonly store?: ArtifactStore
  readonly fetch?: SourceProviderFetch
}

export class ArtifactService {
  constructor(private readonly input: ArtifactServiceInput);
  async list(ref: string): Promise<ArtifactListResult>;
  async resolveCached(
    ref: string,
    sourceId: string,
    maxByteSize?: number,
  ): Promise<ActionArtifact | null>;
  async download(
      ref: string,
      options: {
        readonly outputPath?: string
        readonly signal?: AbortSignal
      } = {},
    ): Promise<ArtifactDownloadResult>;
  async purge(): Promise<ArtifactPurgeResult>;
}
```

### @ctxindex/core — thread retrieval

```ts
export interface ThreadRelationNames {
  readonly conversation: string
  readonly parent: string
}

export type ThreadResource = Omit<StoredResource, 'id'>

export interface ThreadNode {
  readonly resource: ThreadResource
  readonly children: readonly ThreadNode[]
}

export interface ThreadResult {
  readonly mode: 'tree' | 'flat'
  readonly messages: readonly ThreadNode[]
  readonly warnings: readonly UnknownProfileWarning[]
}

export interface CreateThreadServiceInput {
  readonly db: CtxindexDatabase
  readonly profiles: ProfileRegistry
  readonly relationNames?: ThreadRelationNames
}

export interface ThreadService {
  get(ref: string): ThreadResult
}

export function createThreadService({
  db,
  profiles,
  relationNames = DEFAULT_THREAD_RELATION_NAMES,
}: CreateThreadServiceInput): ThreadService;
```

### @ctxindex/core — Resource export

```ts
export interface ExportResourceInput extends RetrieveSourceResourceInput {
  readonly format: string
}

export interface ExportResourceResult {
  readonly bytes: Uint8Array
  readonly mediaType: string
  readonly format: string
  readonly ref: string
  readonly warnings: readonly SourceResourceWarning[]
}

export class UnsupportedExportFormatError extends CtxindexValidationError {
  readonly validFormats: readonly string[]
  readonly profile: ProfileReference
  constructor(
      profile: ProfileReference,
      format: string,
      validFormats: readonly string[],
    );
}

export class ExportDataIntegrityError extends CtxindexError {
  override readonly code = 'data_integrity'
  constructor(message: string, options?: { readonly cause?: unknown });
}

export async function exportSourceResource(
  input: ExportResourceInput,
): Promise<ExportResourceResult>;
```

## Implementation doctrine

Source retrieval parses the Ref, checks `ResourceStore`, invokes the bound Adapter only when complete local state is absent, requires exactly one matching Resource, validates it through the Profile, and stores complete ad-hoc state. Complete mailbox retrieval preserves portable Reply-To addresses, RFC References/message identity, and provider conversation identity so later reply Actions require no provider read before mutation. Thread traversal follows generic membership/parent Relations in both directions.

Profiles derive Artifact descriptors. `ArtifactService` streams Adapter downloads into `ArtifactStore`; the store hashes while writing and commits immutable SHA-256 CAS objects plus SQLite metadata. V1 uses `cached` retention until explicit purge. Output copies do not transfer store ownership.

Action attachment resolution revalidates exact current descriptor membership and selected-Source ownership, rejects an optional maximum-size violation from descriptor or cache metadata before filesystem access, then reads a copied byte array only after the CAS hash, size, path, origin, media type, and declared size agree. It never downloads missing bytes. Purge leaves the descriptor discoverable but makes Action resolution return unavailable until an explicit Artifact download rematerializes the cache.

## Verification

Retrieval tests cover local-first behavior, emission/output validation, and ad-hoc storage. Thread tests cover bidirectional traversal and cycles. Artifact store/service tests cover streaming, integrity, deduplication, output safety, accounting, download contexts, and interrupted purge. Export tests cover Profile renderers and data integrity.
