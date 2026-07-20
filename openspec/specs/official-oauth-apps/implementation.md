# Official OAuth Apps Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; until archive creates the canonical specification, behavioral requirements live in the [active delta](../../changes/provide-official-oauth-apps/specs/official-oauth-apps/spec.md).

## Interfaces

### @ctxindex/core — host managed-App policy

```ts
export type ManagedOAuthAppDistribution = {
  readonly kind: 'bundled'
  readonly packageName: string
}

export interface ManagedOAuthAppPolicy {
  readonly providerId: string
  readonly label: string
  readonly extensionId: string
  readonly distributions: readonly ManagedOAuthAppDistribution[]
}

export type ManagedOAuthAppResolution =
  | {
      readonly status: 'selected'
      readonly providerId: string
      readonly label: string
    }
  | {
      readonly status: 'unavailable'
      readonly providerId: string
      readonly reason: 'not_configured' | 'not_active' | 'provenance_mismatch'
    }
  | {
      readonly status: 'invalid_policy'
      readonly providerId: string
      readonly reason: 'ambiguous'
    }

export function resolveManagedOAuthApp(
  registry: CompleteRegistry,
  policies: readonly ManagedOAuthAppPolicy[],
  providerId: string,
): ManagedOAuthAppResolution;
```

The policy is immutable host release data outside provider-neutral core. The initial matcher accepts only exact bundled package provenance already established by the integrated loader; unsupported distribution kinds remain unavailable rather than being approximated. Resolution is pure and considers only one policy identity, the active App and owning Extension identities, and their retained provenance. App config, client ids, local App rows, Adapter scopes, secrets, and network state are not selection inputs.

## Implementation doctrine

A managed App is an ordinary `defineOAuthApp(exactProvider, { label, config })` leaf contributed through an ordinary `defineExtension()` root. Bundled and external Apps use the same SDK factories, graph collection, complete-registry validation, inventory, and exact `(providerId,label)` identity. Managed authority exists only in host release policy; no authored `official`, `managed`, default, Provider, config, package-manifest, or Catalog-manifest field can establish it.

Omitted App selection succeeds only when one policy entry exactly matches one active App, its owning Extension, and accepted immutable distribution provenance. Missing, inactive, mismatched, or ambiguous policy fails closed before App config or secret reads, persistence, browser launch, or Provider egress. Explicit `--app <label>` bypasses managed selection and retains the ordinary exact Extension-App or local-BYOA resolver.

Managed designation changes selection only. Authorization retains the Provider base scopes plus the sorted deduplicated union of operation scopes from every active same-Provider Adapter, including community Adapters. It adds no scope allowlist, host, mutation, or runtime capability. Provider rejection preserves its existing typed failure and receives static BYOA guidance; it never narrows scopes or starts a second authorization.

Authorization remains provider-direct through the existing Provider endpoints and allowed-host checks, IPv4 loopback callback, state validation, required S256 PKCE, direct token and identity requests, local Secret Vault persistence, and Grant-owned App snapshot. No hosted ctxindex identity service, backend, redirect relay, token proxy, telemetry endpoint, or remote personal-data store participates. Public native-App registration metadata is distributable non-confidential config; tokens, authorization codes, identities, Grants, and local BYOA values remain private local state.

Embedding public registration metadata does not prove publisher, domain, consent, scope, tenant, or production verification. Automated authorization coverage remains synthetic, and provider-specific verification claims stay outside this generic doctrine until their Human checkpoints complete.

## Verification

Generic tests use invented Providers, Apps, Extensions, policies, provenance, and loopback endpoints to cover exact matching, closed failure, explicit override, unchanged scope union, provider-direct egress, stable typed failures, static BYOA guidance, redaction, and no automatic retry. Relocated compiled coverage may inspect safe inventory but does not duplicate production App config or perform live provider authorization.
