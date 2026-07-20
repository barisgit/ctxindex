## Capability Implementation Targets

- `official-oauth-apps` → `openspec/specs/official-oauth-apps/implementation.md`
- `core-model` → `openspec/specs/core-model/implementation.md`
- `oauth-client-management` → `openspec/specs/oauth-client-management/implementation.md`
- `extension-loading` → `openspec/specs/extension-loading/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`

## Module Ownership

`@ctxindex/extension-sdk` remains unchanged: `defineProvider` owns OAuth2 registration and `defineOAuthApp(exactProvider, { label, config })` creates the only Extension App shape. Neither factory accepts managed/default authority or a scope allowlist.

Official and community Extension packages both export ordinary `defineExtension()` roots. The official Google and Microsoft packages own their public App leaves and documentation, but the same leaves could be authored by any external package and selected explicitly.

`@ctxindex/core` owns the provider-neutral policy types, active-App provenance matcher, optional managed-default resolver, and structured safe failure context. Release composition owns the concrete policy entries beside the bundled provider integrations; Extensions cannot author or supply them. Existing OAuth App service, authorization, scope union, Grant snapshot, secret, and refresh seams remain authoritative.

`@ctxindex/cli` makes `--app` optional in parsing, delegates default resolution to core, and formats exact BYOA guidance. It owns no Provider ids, App labels, public identifiers, provenance rules, or provider-specific HTTP behavior.

Issue #60 owns live provider setup and verification. No automated task reads live credentials or provider state. Explicitly authorized public native-App registration values may be embedded only in their owning ordinary Extension App definitions.

## Interfaces and Data Flow

The host policy is deliberately smaller than the authoring model:

```ts
export interface ManagedOAuthAppPolicy {
  readonly providerId: string
  readonly label: string
  readonly extensionId: string
  readonly distributions: readonly ManagedOAuthAppDistribution[]
}

export type ManagedOAuthAppDistribution = {
  readonly kind: 'bundled'
  readonly packageName: string
}
```

Only exact bundled provenance is accepted in the first implementation. Package, Git, and Catalog variants remain absent until their immutable acquisition evidence can extend this interface without approximation. Policy is host-owned immutable release data and is not loaded from Extension exports, package manifests, Catalog manifests, environment, or user config.

```ts
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
): ManagedOAuthAppResolution
```

Resolution is pure. It first validates one policy identity for the Provider, then matches the active OAuth App's existing safe provenance to an accepted distribution and returns the exact label. It never inspects App config/client ids, Adapter scopes, local App rows, secrets, or network state. Explicit `--app` bypasses it and uses the existing exact `OAuthAppService.resolveApp(providerId,label)` path.

The Account add flow becomes:

```text
parse provider + optional --app
  -> explicit label: existing exact App resolution
  -> omitted label: pure managed-policy resolution -> existing exact App resolution
  -> existing all-active-Adapter scope union
  -> existing provider-direct authorization and Grant snapshot
```

No storage change is required. The Grant already owns the selected App config snapshot, and `oauth-app list` already owns the safe Provider/label/origin/provenance projection. Managed status need not be stored or exposed as a new public entity.

## Security and Compatibility

The public App config remains subject to the exact Provider registration schema and complete registry validation. Managed policy supplies selection authority only; it adds no scope, host, mutation, secret, or runtime capability. The selected App follows the existing state validation, required S256 PKCE, IPv4 loopback callback, declared-host egress, token/identity validation, local Secret Vault persistence, and Grant snapshot rules.

An Extension cannot self-assert omission-default status. Conversely, an unreviewed Extension App is not rejected for defining public registration metadata: it remains selectable explicitly. Duplicate `(providerId,label)` identities still reject atomically under the existing registry contract, so a copied App cannot shadow the policy target.

Missing managed policy or provenance mismatch exits before secret/database/browser/network effects and guides the operator to create/select a local App. Provider failures after selection preserve the existing stable typed exit category and append only static commands plus safe Provider/App labels. Raw OAuth responses, authorization URLs, state outside the dedicated URL output, codes, verifiers, tokens, config, secret refs, and identities remain redacted.

## Verification

### Human checkpoint inputs

Issue #60 must compare provider-console configuration with the current loaded-registry result, not with a separately maintained allowlist. For this change's built-in registry, the derived Google union is `email`, `openid`, `https://www.googleapis.com/auth/calendar.events.readonly`, `https://www.googleapis.com/auth/gmail.compose`, and `https://www.googleapis.com/auth/gmail.readonly`. The derived Microsoft union is `Calendars.Read`, `Mail.ReadWrite`, `User.Read`, `offline_access`, and `openid`. Authorization binds an ephemeral IPv4 listener but sends the literal redirect URI `http://localhost:<ephemeral-port>/oauth/callback`; Google and Microsoft console setup must support that native-App loopback behavior. These are review inputs only, not evidence that either console registration or scope set has been approved.

The generic no-identifier slice uses invented Provider/App definitions and synthetic provenance to cover exact policy match, missing policy, inactive App, provenance mismatch, ambiguous policy, explicit App override, unchanged scope union including a community Adapter, Provider rejection, no automatic fallback, safe guidance, redaction, and zero effects before selection failure.

Focused CLI tests cover `account add <provider>` and explicit `--app`, no prompts, stable exits, and deterministic text/JSON. Existing OAuth App, auth, Grant snapshot, secret-backend, and scope-selection tests remain green. Relocated compiled tests use synthetic authorization endpoints and prove offline/default resolution with no undeclared egress; they may assert safe inventory for production App identities but MUST NOT duplicate production config or perform live authorization.

Conformance tests may inspect each App leaf through its owning official Extension and assert policy identity/provenance without duplicating public registration values into mocks. They must not perform live authorization in CI, claim provider verification, or commit provider-console evidence.

Final verification is all focused Slice gates, `bun run ci`, `bunx openspec validate --all --strict`, `openspec-verify-change`, cartography, and system-reference refresh after implementation.

## Promotion Notes

- Promote the managed policy, resolution, same-SDK, unchanged-scope-union, provider-direct, BYOA fallback, and staged activation doctrine into `openspec/specs/official-oauth-apps/implementation.md`.
- Clarify in `core-model/implementation.md` that retained root provenance may be consumed by a separate host release-policy matcher but never by definition identity, equivalence, conflict, or winner selection.
- Extend `oauth-client-management/implementation.md` with optional managed-default resolution before the existing exact App resolver.
- Extend `extension-loading/implementation.md` only with the retained provenance required for host policy matching; do not add authored trust fields.
- Extend `cli-surface/implementation.md` with optional `--app` parsing and structured fallback formatting.
- Extend `error-taxonomy/implementation.md` with missing-default invalid usage and safe post-selection guidance using existing exit categories.
