## Capability Implementation Targets

- `official-oauth-apps` → `openspec/specs/official-oauth-apps/implementation.md`
- `core-model` → `openspec/specs/core-model/implementation.md`
- `oauth-client-management` → `openspec/specs/oauth-client-management/implementation.md`
- `extension-loading` → `openspec/specs/extension-loading/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`

## Module Ownership

`@ctxindex/extension-sdk` remains unchanged: `defineProvider` owns OAuth2 registration and `defineOAuthApp(exactProvider, { label, config })` creates the only Extension App shape. Neither factory accepts managed/default authority or a scope allowlist.

Official and community Extension packages both export ordinary `defineExtension()` roots. The official Google and Microsoft packages eventually own their public App leaves and documentation, but the same leaves could be authored by any external package and selected explicitly.

`@ctxindex/core` owns the host release policy, matching active App provenance, resolving an optional managed default to an exact `(providerId,label)`, and returning structured safe failure context. Existing OAuth App service, authorization, scope union, Grant snapshot, secret, and refresh seams remain authoritative.

`@ctxindex/cli` makes `--app` optional in parsing, delegates default resolution to core, and formats exact BYOA guidance. It owns no Provider ids, App labels, public identifiers, provenance rules, or provider-specific HTTP behavior.

Issue #60 owns live provider setup and verification. No implementation task in the generic slice reads live credentials or provider state.

## Interfaces and Data Flow

The host policy is deliberately smaller than the authoring model:

```ts
export interface ManagedOAuthAppPolicy {
  readonly providerId: string
  readonly label: string
  readonly extensionId: string
  readonly distributions: readonly ManagedOAuthAppDistribution[]
}

export type ManagedOAuthAppDistribution =
  | { readonly kind: 'bundled'; readonly packageName: string }
  | {
      readonly kind: 'package'
      readonly packageName: string
      readonly packageVersion: string
      readonly integrity: string
    }
  | {
      readonly kind: 'git'
      readonly repository: string
      readonly commit: string
      readonly integrity: string
    }
  | {
      readonly kind: 'catalog'
      readonly catalogId: string
      readonly repository: string
      readonly commit: string
      readonly sourcePath: string
      readonly integrity: string
    }
```

Only provenance variants already supported by the integrated acquisition/runtime model are accepted in the first implementation. Unsupported variants remain absent rather than approximated. Policy is host-owned immutable release data and is not loaded from Extension exports, package manifests, Catalog manifests, environment, or user config.

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

The generic no-identifier slice uses invented Provider/App definitions and synthetic provenance to cover exact policy match, missing policy, inactive App, provenance mismatch, ambiguous policy, explicit App override, unchanged scope union including a community Adapter, Provider rejection, no automatic fallback, safe guidance, redaction, and zero effects before selection failure.

Focused CLI tests cover `account add <provider>` and explicit `--app`, no prompts, stable exits, and deterministic text/JSON. Existing OAuth App, auth, Grant snapshot, secret-backend, and scope-selection tests remain green. Relocated compiled tests embed only synthetic Apps and prove offline/default resolution with no undeclared egress. The production policy stays empty until provider checkpoints complete.

After each Human checkpoint, conformance tests may inspect the App leaf through the owning official Extension and assert policy identity/provenance without duplicating the public id into mocks. They must not perform live authorization in CI or commit provider-console evidence.

Final verification is all focused Slice gates, `bun run ci`, `bunx openspec validate --all --strict`, `openspec-verify-change`, cartography, and system-reference refresh after implementation.

## Promotion Notes

- Promote the managed policy, resolution, same-SDK, unchanged-scope-union, provider-direct, BYOA fallback, and staged activation doctrine into `openspec/specs/official-oauth-apps/implementation.md`.
- Clarify in `core-model/implementation.md` that retained root provenance may be consumed by a separate host release-policy matcher but never by definition identity, equivalence, conflict, or winner selection.
- Extend `oauth-client-management/implementation.md` with optional managed-default resolution before the existing exact App resolver.
- Extend `extension-loading/implementation.md` only with the retained provenance required for host policy matching; do not add authored trust fields.
- Extend `cli-surface/implementation.md` with optional `--app` parsing and structured fallback formatting.
- Extend `error-taxonomy/implementation.md` with missing-default invalid usage and safe post-selection guidance using existing exit categories.
