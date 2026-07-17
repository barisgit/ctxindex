# OAuth Client Management Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/core/src/client/types.ts`

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

### `packages/core/src/client/resolution.ts`

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

### `packages/core/src/client/service.ts`

```ts
export function createOAuthClientService(
  deps: OAuthClientServiceDeps,
): OAuthClientService;
```

## Implementation doctrine

`packages/core/src/client` owns add/list/remove/resolve behavior. SQLite stores provider, label, timestamps, and typed client credential references; values live only in the routing Secret Vault.

`client add --from-env` reads Adapter-declared environment names once and persists the values. Authorization resolves one provider-matched stored Client and does not reread client credentials from the environment. Inventory omits values and references; failed adds clean temporary secrets.

## Verification

Client service tests cover provider/label uniqueness, deterministic resolution, cleanup, removal, and non-sensitive inventory. CLI/e2e tests cover one-time environment ingestion and authorization through persisted Client state.
