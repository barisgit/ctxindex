## Why

A fresh ctxindex installation still requires each user to create an OAuth application in Google or Microsoft before authorizing an Account. The Extension SDK now has the correct reusable pieces: Providers own OAuth registration policy, `defineOAuthApp()` binds public registration metadata to an exact imported Provider, and both bundled and external Extensions use the same authoring and activation path. What is missing is a host-established way to select one reviewed App as the zero-setup default without weakening exact App selection or removing local BYOA.

## What Changes

- Define a managed OAuth App as an ordinary `defineOAuthApp(provider, { label, config })` leaf whose `(providerId,label)` and Extension distribution provenance are selected by ctxindex release policy, not by an Extension-authored `official` flag.
- Allow `account add <provider>` to omit `--app` only when the host release has exactly one available managed App for that Provider. An explicit `--app <label>` always selects that exact Extension or local BYOA App.
- Preserve the current Provider-owned registration contract and exact dynamic scope union. Managed Apps do not add, remove, allowlist, or otherwise reinterpret Adapter scopes; provider approval can still reject scopes that were not approved for that App.
- Keep authorization provider-direct and local through the existing state-checked S256 PKCE loopback flow. Public App registration metadata may ship in source or the compiled CLI, while tokens, Grant snapshots, local BYOA secrets, and personal data remain local.
- Return deterministic `oauth-app add ... --from-env` and `account add ... --app ...` guidance when no managed App can be resolved. After authorization starts, preserve Provider failures without attaching selection fallback or retrying through another App.
- Keep automated runtime/CLI authorization evidence synthetic while allowing explicitly authorized public Google and Microsoft native-App registration metadata to ship and participate in exact managed release-policy matching before provider verification completes; documentation and status MUST NOT claim approval that has not happened.

## Capabilities

### New Capabilities

- `official-oauth-apps`: Host-established managed-App designation, deterministic default selection, provider-direct security boundaries, explicit BYOA fallback, and release-gated provider activation.

### Modified Capabilities

- `core-model`: Clarify that retained Extension provenance never changes definition identity, equivalence, or duplicate resolution but may be matched by host policy for managed-default eligibility.
- `oauth-client-management`: Permit one host-designated Extension App to be selected when `--app` is omitted while preserving exact `(providerId,label)` identity and local BYOA.
- `extension-loading`: Retain enough immutable Extension provenance for host release policy to recognize a managed App without a built-in-only SDK shape or an author-controlled trust flag.
- `cli-surface`: Add the managed default form of `account add <provider>` and deterministic fallback guidance while keeping explicit App selection agent-safe.
- `error-taxonomy`: Treat missing managed defaults as invalid usage with redacted BYOA guidance, while preserving post-selection Provider failures through existing stable exit categories without selection fallback.

## Impact

- `@ctxindex/extension-sdk` needs no parallel official-App factory: the accepted `defineProvider`, `defineOAuthApp`, and `defineExtension` contracts remain authoritative.
- Official Google and Microsoft Extensions export ordinary OAuth App leaves alongside their Providers and Adapters. External Extensions may export Apps through exactly the same SDK; only host release policy determines which App, if any, is the omission default.
- `@ctxindex/core` owns release-policy matching and exact managed-default resolution. `@ctxindex/cli` owns only parsing and safe formatting.
- The implementation contains generic policy/resolution, synthetic tests, CLI behavior, redaction, egress, and compiled coverage. Production public registration metadata is ordinary non-secret Extension App config and is never copied into mocked provider fixtures; no live credentials, backend, ctxindex Account, relay, proxy, or provider data are required.
- Issue #60 remains the Human/external owner for redirects, publisher/domain verification, scopes, legal surfaces, and provider approval. Each embedded public registration can complete verification independently after its checkpoint.
