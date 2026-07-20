# OAuth App Management Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

### @ctxindex/extension-sdk — Extension OAuth Apps

```ts
export interface OAuthAppDefinition<
  TProvider extends ProviderDefinition<string, OAuth2Auth> = ProviderDefinition<string, OAuth2Auth>,
  TLabel extends string = string,
  TConfig = unknown,
> {
  readonly kind: 'oauth-app'
  readonly provider: TProvider
  readonly label: TLabel
  readonly config: TConfig
}

export function defineOAuthApp<
  const TProvider extends ProviderDefinition<string, OAuth2Auth>,
  const TLabel extends string,
>(
  provider: TProvider,
  definition: {
    readonly label: TLabel
    readonly config: z.input<TProvider['auth']['registration']['configSchema']>
  },
): OAuthAppDefinition<TProvider, TLabel>;
```

The factory accepts one exact imported OAuth2 Provider. Extension Apps require public registration policy and contain no typed secret references or host-private values.

### @ctxindex/core — safe inventory and local BYOA

```ts
export interface OAuthAppInventoryEntry {
  readonly providerId: string
  readonly label: string
  readonly origin: 'builtin' | 'extension' | 'local'
  readonly provenance?: SafeDefinitionProvenance
}

export interface LocalOAuthAppRecord {
  readonly providerId: string
  readonly label: string
  readonly configRefs: Readonly<Record<string, SecretRef>>
  readonly createdAt: number
  readonly updatedAt: number
}

export interface OAuthAppService {
  addFromEnvironment(providerId: string, label: string): Promise<OAuthAppInventoryEntry>
  list(): readonly OAuthAppInventoryEntry[]
  remove(providerId: string, label: string): Promise<void>
  resolve(providerId: string, label: string): Promise<ResolvedOAuthApp>
}
```

Inventory combines active Extension Apps and local BYOA Apps but uses an explicit safe projection. Duplicate `(providerId,label)` identities reject across every origin; there is no shadowing or default label.

### Provider registration environment import

OAuth2 Provider registration maps each top-level App config-schema key to one validated environment variable name. Local `oauth-app add --from-env` resolves the Provider first, reads through the central environment loader, validates the assembled complete config, writes typed secret references, then persists the record. Failure cleans new references. Authorization and refresh never use the environment map.

## Implementation doctrine

Core owns OAuth App inventory, local BYOA persistence, exact resolution, and collision handling. Complete-registry validation owns Extension App policy and cross-origin duplicate rejection. Fresh storage uses OAuth App terminology and has no Client table, view, service, command, alias, or compatibility path.

Account authorization with an explicit App label bypasses managed selection. With no label, core's pure host-policy resolver returns one exact managed label only after matching the active App, its owning Extension, and accepted provenance. Missing, inactive, mismatched, or ambiguous policy fails before config or secret reads, persistence, browser launch, or Provider egress; it never guesses a local or unreviewed App.

Both paths then use the same exact `(providerId,label)` resolver, validate the App against the active semantic Provider, request the unchanged Provider-base plus all-active-Adapter scope union, and create a private Grant-owned snapshot. Removing an App affects future authorization only.

## Verification

Service, registry, secret, and CLI tests cover App policy, safe deterministic inventory, exact selection, environment import, zero-effect validation, duplicate rejection, snapshot independence, removal, cleanup, and absence of Client compatibility.
