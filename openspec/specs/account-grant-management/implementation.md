# Account Grant Management Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

### @ctxindex/core — private Grant state

```ts
export interface GrantAppSnapshot {
  readonly providerId: string
  readonly appLabel: string
  readonly configRefs: Readonly<Record<string, SecretRef>>
}

export interface GrantRow {
  readonly id: string
  readonly accountId: string
  readonly providerId: string
  readonly scopes: readonly string[]
  readonly appSnapshot: GrantAppSnapshot
  readonly accessTokenRef: SecretRef | null
  readonly refreshTokenRef: SecretRef | null
  readonly expiresAt: number | null
}

export interface AuthorizeProviderInput {
  readonly providerId: string
  readonly appLabel: string
  readonly accountLabel?: string
}

export interface AuthorizeProviderResult {
  readonly accountId: string
  readonly providerId: string
  readonly scopes: readonly string[]
}
```

Grant ids and snapshots remain private implementation state. Public Account inventory projects Account identity, label, Provider, expiry, and bound Sources without exposing Grant selectors, App configuration, or secret references.

### @ctxindex/core — exact Provider selection

```ts
export interface OAuthSelection {
  readonly provider: AnyProviderDefinition
  readonly app: AnyOAuthAppDefinition | ResolvedLocalOAuthApp
  readonly operationScopes: readonly string[]
  readonly requestedScopes: readonly string[]
}

export function resolveOAuthSelection(
  registry: CompleteRegistry,
  providerId: string,
  appLabel: string,
): OAuthSelection;
```

Selection resolves exact semantic Provider and exact `(providerId,label)` OAuth App identity before secrets, persistence, browser launch, or Provider egress. Requested scopes are the Provider base scopes plus the sorted union from every active Adapter importing that Provider id. Providerless Adapters never enter this path.

### @ctxindex/core — authorized Provider context

```ts
export interface CreateSourceProviderContextInput {
  readonly db: CtxindexDatabase
  readonly sourceId: string
  readonly registry: CompleteRegistry
  readonly authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'>
  readonly logger: AdapterLogger
  readonly fetch?: SourceProviderFetch
  readonly retryUnauthorized?: boolean
}
```

Source creation and operations bind through the Adapter's exact imported active Provider. OAuth2-backed Adapters require a matching Account and all Adapter scopes; `none` Providers and providerless Adapters require no Account or Grant. Read contexts may perform one 401 refresh retry. Action contexts set `retryUnauthorized: false`.

## Implementation doctrine

Provider-neutral core owns Account persistence, App selection, scope selection, loopback PKCE/state, token and identity validation, Grant persistence, refresh, and authorized fetch. Provider definitions own OAuth endpoints, identity, App schema, registration policy, base scopes, and authorization hosts; Adapters own only operation scopes and Provider API hosts.

Authorization copies the exact selected App configuration into new Grant-owned secret references before committing Account/Grant state. Reauthorization durably swaps the replacement snapshot before cleaning superseded references. Refresh uses the Grant snapshot and never current App inventory or Provider environment mappings. Rotated refresh tokens follow the same write-verify-swap-clean order.

## Verification

Account/auth tests cover exact App selection, active-Adapter scope union, providerless bypass, identity upsert, scope validation, snapshot durability, reauthorization, removal, refresh rotation, cleanup, redaction, and no automatic Action retry. Loopback-only Google/Microsoft and CLI e2e tests exercise the common flow.
