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

Authorization, refresh, and removal use one process-wide asynchronous queue keyed by exact Provider and external user id. Each operation re-reads current Grant state after entering the Account critical section, and removal additionally revalidates its exact label selector before deletion. Same-Account replacements therefore clean the state they actually supersede, a stale old-label removal cannot delete a renamed Account, and unrelated Accounts remain concurrent.

Authentication cleanup returns a failed-entry count instead of discarding deletion failures. Pre-commit callers retain their original failure; post-commit reauthorization, refresh, and Account removal retain their usable committed result. Each nonzero count produces one warning through the injected logger whose bindings are exactly Provider id, Grant id, lifecycle phase, and failed-entry count. Account id, failed refs, credential keys, caught backend errors, App config, token material, and other sensitive fields never enter the warning.

Account removal commits Account/Grant deletion and cleared Source bindings before physical cleanup. That database state stays authoritative when cleanup warns. Typed-ref deletion is idempotent: retrying a failed deletion, including after the physical row was already removed but its inventory entry remained, converges without recreating authorization state. Likewise, “authoritative Grant refs” means refs selected by the committed Grant row; superseded physical rows retained after cleanup failure are pending garbage, not live authorization state.

## Daemon ownership

Account add, list, and remove run in the daemon; reauthorization with a new label is the rename path, with no separate rename command. Authorization is staged: the streamed `account.add` procedure prepares provider-neutral authorization state, opens the daemon-owned loopback callback listener, and yields one `authorization.required` event carrying an opaque request id and the authorization URL. The CLI owns presentation and browser launch (suppressed by `CTXINDEX_NO_BROWSER=1`) and may submit the hidden manual redirect or code once through `account.respond` against that id. The daemon accepts whichever valid state/code arrives first and performs provider exchange, identity resolution, serialized Grant mutation, and persistence before the stream returns the Account id. The request id is one-use, owner-private, expires on its own bounded clock, and carries no token or App secret. A mismatched state consumes the stage and fails the authorization, and cancelling the Account stream withdraws its pending stage.

## Verification

`apps/daemon/src/account-authorization.test.ts` covers opaque one-use stage ids, independent stage expiry, mismatched-state consumption, cancellation withdrawal, and secret/payload exclusion; `apps/cli/src/e2e/compiled-oauth-account-lifecycle.e2e.test.ts` runs the packaged flow against loopback mocks with synthetic credentials. Account/auth tests cover exact App selection, active-Adapter scope union, providerless bypass, identity upsert, scope validation, snapshot durability, explicit-gate same-Account reauthorization and refresh, queued rename/removal races, authoritative committed removal, idempotent cleanup retry, refresh rotation, cleanup failure counting, post-commit success preservation, warning redaction, and no automatic Action retry. Loopback-only Google/Microsoft and CLI e2e tests exercise the common flow.
