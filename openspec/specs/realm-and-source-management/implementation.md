# Realm and Source Management Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/core — Realm contracts

```ts
export interface RealmRow {
  readonly id: string
  readonly slug: string
  readonly label: string | null
  readonly created_at: number
}

export interface CreateRealmInput {
  readonly slug: string
  readonly displayName?: string
}

export interface CreateRealmResult {
  readonly realmId: string
}

export interface RealmServiceDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
}

export interface RealmService {
  createRealm(input: CreateRealmInput): CreateRealmResult
  listRealms(): RealmRow[]
  getRealmBySlug(slug: string): RealmRow | null
  findRealmBySlug(slug: string): RealmRow | null
  deleteRealm(slug: string): void
}
```

### @ctxindex/core — Source contracts

```ts
export type SourceAvailability = 'available' | 'extension_unavailable'

export interface SourceRow {
  readonly id: string
  readonly realm_id: string
  readonly realm_slug?: string
  readonly adapter_id: string
  readonly adapter_version: number
  readonly label: string
  readonly config_json: string | null
  readonly sync_enabled: boolean
  readonly search_routing?: SearchRouting | null
  readonly grant_id?: string | null
  readonly created_at: number
  readonly availability: SourceAvailability
  readonly last_status?: string | null
  readonly last_run_at?: number | null
  readonly errors_count?: number | null
  readonly items_count?: number
  readonly chunks_count?: number
  readonly sample_uri?: string | null
  readonly account_email?: string | null
}

export interface AddSourceInput {
  readonly adapterId: string
  readonly realmSlug?: string
  readonly adapterVersion?: number
  readonly label?: string
  readonly configJson?: string
  readonly grantId?: string
  readonly searchRouting?: SearchRouting
  readonly syncEnabled?: boolean
}

export interface AddSourceResult {
  readonly sourceId: string
  readonly realmId: string
}

export interface ListSourcesInput {
  readonly realmSlug?: string
}

export interface StatusRow {
  readonly sourceId: string
  readonly adapterId: string
  readonly realmSlug: string
  readonly availability: SourceAvailability
  readonly lastStatus: string
  readonly lastRunAt: number | null
  readonly errorsCount: number
  readonly lastError: string | null
  readonly cursor: unknown
}

export interface SourceServiceDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
  readonly registry: ExtensionRegistry
  readonly realmService?: RealmService
}

export interface SourceService {
  addSource(input: AddSourceInput): AddSourceResult
  listSources(input?: ListSourcesInput): SourceRow[]
  resolveSourceId(reference: string): string
  findSourceById(sourceId: string): SourceRow | null
  removeSource(sourceId: string): void
  getStatus(input?: { sourceId?: string }): StatusRow[]
}
```

### @ctxindex/core — provider context construction

```ts
export type SourceProviderFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

export interface SourceProviderContext {
  readonly adapter: AnyAdapterDefinition
  readonly source: AdapterSourceContext
  readonly fetch: typeof fetch
  readonly logger: AdapterLogger
}

export interface CreateSourceProviderContextInput {
  readonly db: CtxindexDatabase
  readonly sourceId: string
  readonly registry: ExtensionRegistry
  readonly authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'>
  readonly logger: AdapterLogger
  readonly fetch?: SourceProviderFetch
  readonly retryUnauthorized?: boolean
}

export async function createSourceProviderContext(
  input: CreateSourceProviderContextInput,
): Promise<SourceProviderContext>;
```

### @ctxindex/core — Realm service boundary

```ts
export function createRealmService(deps: RealmServiceDeps): RealmService;
```

### @ctxindex/core — Source service boundary

```ts
export function createSourceService(deps: SourceServiceDeps): SourceService;
```

## Implementation doctrine

`@ctxindex/core` owns Realm rows and exact slug lookup plus Source creation, listing, status, removal, Adapter/config validation, Grant compatibility, sync policy, and provider-context construction. Every Source stores one Adapter version, one Realm, one config payload, an explicit sync-enabled boolean, and an explicit Grant when required. Source creation writes the requested sync policy or true when omitted; public Source rows normalize the SQLite value to a boolean.

Availability is derived by resolving the stored Adapter binding against the loaded registry, not from sync status. Provider contexts expose only Source metadata, scoped logger, and host-allowlisted authorized fetch. The CLI validates generic Source flags before opening state and maps stored snake-case fields to camel-case JSON, including `syncEnabled`. Core seeds no special Realm.

## Verification

Realm/Source service tests cover exact lookup, labels, config validation, Grant compatibility, sync policy persistence/defaulting, availability, removal, and status. Provider-context tests cover host allowlists, token use, retry policy, and redaction; CLI tests cover registry-derived Source arguments, strict generic flag parsing, delegation, and JSON inventory.
