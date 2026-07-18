# Account Grant Management Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/core — Account records and inventory

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

### @ctxindex/core — Grant and authorization contracts

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

### @ctxindex/core — provider authorization

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

### @ctxindex/core — Grant compatibility

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

### @ctxindex/core — authorized provider context

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

### @ctxindex/core — Account service boundary

```ts
export function createAccountService(deps: AccountServiceDeps): AccountService;
```

### @ctxindex/core — authorization service boundary

```ts
export function createAuthService(deps: AuthDependencies): AuthService;
```

### @ctxindex/core — OAuth selection

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

### @ctxindex/core — OAuth token exchange

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

### @ctxindex/core — OAuth loopback

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

`@ctxindex/core` owns Account persistence and inventory plus provider-neutral authorization, scope selection, loopback PKCE/state, token and identity validation, Grant persistence, refresh, and authorized fetch. Adapters provide declarative provider metadata; provider response normalization remains Adapter-owned.

Secret values are written before the Account/Grant transaction and cleaned if persistence fails. Reauthorization updates the Account's stable Grant in place. Refresh rotation writes the replacement, transactionally updates references, then deletes superseded references. Read contexts may request one 401 refresh retry; Action contexts set `retryUnauthorized: false`.

## Verification

Account/auth tests cover identity upsert, scope normalization, compatibility, stable Grant updates, removal, refresh rotation, cleanup, and redaction. Loopback-only Google/Microsoft integration and CLI e2e tests exercise the common flow.
