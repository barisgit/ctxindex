# OAuth Client Management Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/core — OAuth Client records and service

```ts
export interface OAuthClientRecord {
  readonly provider: string
  readonly label: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface AddOAuthClientInput {
  readonly provider: string
  readonly label?: string
  readonly clientId: string
  readonly clientSecret?: string
}

export interface OAuthClientServiceDeps {
  readonly db: CtxindexDatabase
  readonly store: SecretsStore
  readonly now?: () => number
}

export interface OAuthClientService {
  addClient(input: AddOAuthClientInput): Promise<OAuthClientRecord>
  listClients(): OAuthClientRecord[]
  removeClient(provider: string, label: string): Promise<void>
}
```

### @ctxindex/core — OAuth Client resolution

```ts
export interface ResolveOAuthClientInput {
  readonly provider: string
  readonly label?: string
}

export interface ResolvedOAuthClient {
  readonly provider: string
  readonly label: string
  readonly clientId: string
  readonly clientSecret?: string
}

export async function resolveOAuthClient(
  input: ResolveOAuthClientInput,
  deps: Pick<OAuthClientServiceDeps, 'db' | 'store'>,
): Promise<ResolvedOAuthClient>;
```

### @ctxindex/core — OAuth Client service boundary

```ts
export function createOAuthClientService(
  deps: OAuthClientServiceDeps,
): OAuthClientService;
```

## Implementation doctrine

`@ctxindex/core` owns OAuth Client add, list, remove, and resolve behavior. SQLite stores provider, label, timestamps, and typed client credential references; values live only in the routing Secret Vault.

`client add --from-env` reads Adapter-declared environment names once and persists the values. Authorization resolves one provider-matched stored Client and does not reread client credentials from the environment. Inventory omits values and references; failed adds clean temporary secrets.

## Verification

Client service tests cover provider/label uniqueness, deterministic resolution, cleanup, removal, and non-sensitive inventory. CLI/e2e tests cover one-time environment ingestion and authorization through persisted Client state.
