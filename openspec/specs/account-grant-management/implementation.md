# Account Grant Management Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/core/src/account/types.ts`

```ts
export interface VerifiedAccountIdentityInput {
  readonly kind: string
  readonly value: string
}

export interface UpsertAccountInput {
  readonly provider: string
  readonly externalUserId: string
  readonly label?: string
  readonly verifiedIdentities: readonly VerifiedAccountIdentityInput[]
}

export interface UpsertAccountResult {
  readonly accountId: string
}

export type AccountExpiryState = 'active' | 'expired' | 'unknown'

export interface AccountInventoryRealm {
  readonly id: string
  readonly slug: string
  readonly label: string
}

export interface AccountInventoryAdapter {
  readonly id: string
  readonly version: number
}

export interface AccountInventorySource {
  readonly id: string
  readonly label: string
  readonly adapter: AccountInventoryAdapter
  readonly realm: AccountInventoryRealm
}

export interface AccountInventoryGrant {
  readonly id: string
  readonly scopes: readonly string[]
  readonly expiresAt: number | null
  readonly expiryState: AccountExpiryState
  readonly sources: readonly AccountInventorySource[]
}

export interface AccountInventoryItem {
  readonly id: string
  readonly provider: string
  readonly label: string | null
  readonly grants: readonly AccountInventoryGrant[]
}

export interface AccountServiceDeps {
  readonly db: CtxindexDatabase
  readonly now?: () => number
}

export interface AccountService {
  upsertAccount(input: UpsertAccountInput): UpsertAccountResult
  listAccountInventory(): AccountInventoryItem[]
}
```

### `packages/core/src/auth/types.ts`

```ts
export interface GrantRow {
  readonly id: string
  readonly accountId: string
  readonly provider: string
  readonly accountLabel: string | null
  readonly scopes: readonly string[]
  readonly accessTokenRef: string | null
  readonly refreshTokenRef: string | null
  readonly clientIdRef: string | null
  readonly clientSecretRef: string | null
  readonly expiresAt: number | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface AddGrantInput {
  readonly provider: string
  readonly account: Omit<UpsertAccountInput, 'provider'>
  readonly scopes: readonly string[]
  readonly clientId: string
  readonly clientSecret?: string
  readonly accessToken?: string
  readonly refreshToken: string
  readonly expiresAt?: number
}

export interface AddGrantResult {
  readonly grantId: string
  readonly accountId: string
}

export interface AuthDependencies {
  readonly db: CtxindexDatabase
  readonly store: SecretsStore
  readonly logger: Logger
  readonly registry: AdapterRegistry
  readonly readEnvironment?: (name: string) => string | undefined
  readonly now?: () => number
}

export interface AuthService {
  addGrant(input: AddGrantInput): Promise<AddGrantResult>
  removeAccount(label: string): Promise<void>
  getGrantById(grantId: string): Promise<GrantRow | null>
  listGrants(provider?: string): Promise<readonly GrantRow[]>
  resolveLinkedGrantAccessToken(
    grantId: string,
    options?: { readonly forceRefresh?: boolean },
  ): Promise<string>
  refreshAccessToken(grantId: string): Promise<string>
}
```

### `packages/core/src/auth/authorize-provider.ts`

```ts
export interface AuthorizeProviderInput {
  readonly provider: string
  readonly mode: 'loopback' | 'from-env'
  readonly client?: string
  readonly label?: string
}

export interface AuthorizeProviderDependencies {
  readonly registry: AdapterRegistry
  readonly authService: AuthService
  readonly resolveClient: (
    input: ResolveOAuthClientInput,
  ) => Promise<ResolvedOAuthClient>
  readonly readEnvironment?: (name: string) => string | undefined
  readonly launchBrowser?: (url: string) => Promise<void> | void
  readonly emitAuthorizationUrl?: (url: string) => void
  readonly now?: () => number
}

export interface AuthorizeProviderResult extends AddGrantResult {
  readonly provider: string
  readonly scopes: readonly string[]
}

export async function authorizeProvider(
  input: AuthorizeProviderInput,
  deps: AuthorizeProviderDependencies,
): Promise<AuthorizeProviderResult>;
```

### `packages/core/src/auth/compatibility.ts`

```ts
export interface GrantCompatibilityInput {
  readonly provider: string
  readonly scopes: unknown
}

export function providerIdForAuth(auth: AdapterAuthSpec): string | undefined;

export function isGrantCompatible(
  auth: AdapterAuthSpec,
  grant: GrantCompatibilityInput,
): boolean;
```

### `packages/core/src/source/provider-context.ts`

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

### `packages/core/src/account/service.ts`

```ts
export function createAccountService(deps: AccountServiceDeps): AccountService;
```

### `packages/core/src/auth/service.ts`

```ts
export function createAuthService(deps: AuthDependencies): AuthService;
```

### `packages/core/src/auth/selection.ts`

```ts
export interface OAuthSelection {
  readonly provider: NonNullable<
    ReturnType<AdapterRegistry['getOAuthProvider']>
  >
  readonly operationScopes: readonly string[]
  readonly requestedScopes: readonly string[]
}

export function resolveOAuthSelection(
  registry: AdapterRegistry,
  providerId: string,
): OAuthSelection;

export function selectedOAuthScopes(
  registry: AdapterRegistry,
  providerId: string,
): readonly string[];
```

### `packages/core/src/auth/oauth-token.ts`

```ts
export interface OAuthTokenResponse {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly expiresIn: number
  readonly scope?: string
}

export async function postOAuthToken(input: {
  readonly provider: OAuthProviderSpec
  readonly endpoint: string
  readonly clientId: string
  readonly clientSecret?: string
  readonly grant: OAuthGrant
}): Promise<OAuthTokenResponse>;
```

### `packages/core/src/auth/loopback.ts`

```ts
export interface OAuthLoopbackResult {
  readonly code: string
  readonly codeVerifier: string
  readonly redirectUri: string
  readonly authorizationUrl: string
}

export async function openOAuthLoopback(input: {
  readonly provider: OAuthProviderSpec
  readonly authorizationEndpoint: string
  readonly clientId: string
  readonly scopes: readonly string[]
  readonly timeoutMs?: number
  readonly noBrowser?: boolean
  readonly launchBrowser?: (url: string) => Promise<void> | void
  readonly emitAuthorizationUrl?: (url: string) => void
}): Promise<OAuthLoopbackResult>;
```

## Implementation doctrine

`packages/core/src/account` owns Account upsert/inventory SQL. `packages/core/src/auth` owns provider-neutral authorization, scope selection, loopback PKCE/state, token/identity validation, Grant persistence, refresh, and authorized fetch. Adapters provide declarative provider metadata; provider response normalization remains Adapter-owned.

Secret values are written before the Account/Grant transaction and cleaned if persistence fails. Reauthorization updates the Account's stable Grant in place. Refresh rotation writes the replacement, transactionally updates references, then deletes superseded references. Read contexts may request one 401 refresh retry; Action contexts set `retryUnauthorized: false`.

## Verification

Account/auth tests cover identity upsert, scope normalization, compatibility, stable Grant updates, removal, refresh rotation, cleanup, and redaction. Loopback-only Google/Microsoft integration and CLI e2e tests exercise the common flow.
