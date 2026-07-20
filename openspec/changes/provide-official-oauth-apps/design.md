## Context

The redesigned Extension SDK has already settled the authoring graph. `defineProvider()` owns OAuth endpoints, identity mapping, PKCE, registration config schema and environment import, base scopes, and allowed hosts. `defineOAuthApp(exactProvider, { label, config })` creates a public App leaf with stable identity `(providerId,label)`. `defineExtension()` collects Apps, Providers, Profiles, and Adapters. Bundled, path, Catalog, npm, Git, and local packages must enter the same collector and complete-registry validation path; package dependencies and normal imports express reuse.

The current CLI requires `account add <provider> --app <label>`. Local BYOA Apps are imported once with `oauth-app add <provider> <label> --from-env`; Extension Apps are already safe-inventoried and their config is never printed. Account authorization snapshots the selected App config into the private Grant, so later refresh is independent of the current App inventory.

Issue #61 needs a zero-portal common path. Issue #60 owns Google/Microsoft registration, public identifiers, publisher/domain verification, reviewed provider scopes, and legal/support checkpoints. This change must not turn “official” into another SDK definition type or let an Extension grant itself default-selection authority.

## Goals / Non-Goals

**Goals:**

- Select one reviewed ctxindex-managed App by Provider when `--app` is omitted.
- Keep all OAuth Apps as ordinary SDK values with stable `(providerId,label)` identity.
- Establish managed status from host release policy plus immutable Extension provenance, never from App config or an authored trust flag.
- Preserve explicit `--app` for local BYOA and any other Extension App.
- Preserve the exact all-active-Adapter scope union for every selected App.
- Keep provider-direct loopback PKCE, local secret storage, Grant snapshots, bounded egress, safe inventory, and stable exits.
- Let generic runtime/CLI support land before production client identifiers exist.

**Non-Goals:**

- A second `defineOfficialOAuthApp` factory, Provider subfield, built-in-only App shape, App reference, or compatibility alias.
- Restricting managed Apps to scopes contributed only by official Adapters. Extensions may enlarge the ordinary dynamic union; the provider decides whether that App may receive those scopes.
- A runtime scope allowlist, remote feature flag, hosted ctxindex Account, auth relay, token proxy, token escrow, telemetry, or remote personal-data storage.
- Guessing among local or unreviewed Apps, falling back automatically after provider egress, or hiding public native-App identifiers as secrets.
- Creating or verifying Google/Microsoft Apps, changing Adapter scopes, or committing provider-console evidence.

## Decisions

1. **Managed is host policy over an ordinary OAuth App.** The public value remains `defineOAuthApp(provider, { label, config })`. A release policy identifies the exact `(providerId,label)`, owning Extension id, and accepted immutable distribution provenance. The App cannot author `official`, `managed`, default, or scope-policy authority. This keeps built-in and external authoring identical while separating execution trust from ctxindex-managed default selection.

2. **The omission default is unique and closed.** `account add <provider>` selects a managed App only when exactly one active App matches that Provider's release policy. Zero matches fail before effects with BYOA guidance. More than one match is an invalid release/policy state and also fails closed. `--app <label>` always uses the existing exact resolver and never consults default priority.

3. **BYOA is explicit, not guessed.** The permanent fallback is `oauth-app add <provider> <label> --from-env`, followed by `account add <provider> --app <label>`. The runtime does not auto-select a lone local App because current OAuth App semantics deliberately require exact labels. This also keeps scripts deterministic if another App appears later.

4. **Managed Apps do not control consent.** Authorization continues to request the Provider's base scopes plus the sorted deduplicated union of every active same-provider Adapter's operation scopes. Managed designation neither filters contributors nor supplies an allowlist. If Google or Microsoft has not approved a requested scope for the public App, the provider rejects the request and ctxindex reports the safe failure plus BYOA guidance.

5. **Provider registration remains the only config contract.** `defineOAuthApp` config is inferred and runtime-validated from the exact imported Provider's `auth.registration.configSchema`. The Provider also owns the environment mapping used only by local `oauth-app add --from-env`. A public Extension App may carry provider-issued non-confidential native-App metadata; inventory never reveals config. No production public identifier is required to implement or test selection.

6. **Release provenance is matched, not embedded as authority.** Core compares active registry provenance with a host-owned immutable policy. The initial supported policy may name only bundled official packages; later immutable installed npm/Git/Catalog provenance can use the same interface when its acquisition contract is available. An external App that is not policy-matched remains fully usable through explicit `--app`; it is not rejected merely for copying a public id.

7. **Failure never starts a second flow.** Missing/default-policy failures happen before secret reads, persistence, browser launch, or provider egress and exit as invalid usage. Once a managed authorization begins, provider rejection, quota, network, or permission failure retains its existing stable category, persists no partial Account/Grant, and appends explicit BYOA commands. No automatic credential switch or second browser is opened.

8. **The generic slice lands with an empty production policy.** Tests inject invented Providers, Apps, Extension provenance, and loopback endpoints. Production code can ship resolution and CLI support while Google and Microsoft remain BYOA-only. Each real App is activated later by adding its ordinary OAuth App leaf and exact release-policy entry after issue #60 approves the public identifier and provider configuration.

## Risks / Trade-offs

- [Public client identifiers can be copied] → Treat them as public native-App metadata, require PKCE, monitor provider quota, and retain BYOA; do not bundle a pretend secret.
- [A community Adapter requests a scope absent from official approval] → Preserve the union and surface the provider's safe failure; users can disable that Extension or use a suitable explicit App/BYOA registration.
- [Release policy drifts from the Extension] → Exact identity/provenance matching fails closed before effects and leaves explicit App selection functional.
- [A provider approval changes after release] → Learn that from provider responses, keep stable error mapping, and provide deterministic BYOA instructions.
- [Default omission makes scripts less explicit] → `--app` remains supported and is recommended when reproducible App choice matters.

## Migration Plan

First land the generic policy type, matcher, resolver, CLI omission form, safe failures, and synthetic/compiled tests with no production managed entries. Fresh-state BYOA behavior and explicit `--app` remain unchanged; no database migration is needed because Grants already own exact App snapshots. After each issue #60 Human checkpoint, add that provider's ordinary OAuth App definition and one reviewed release-policy entry, run provider definition/conformance and compiled tests, then enable the omission default for that provider. Removing a policy entry later disables only future default selection; explicit App selection and existing Grant refresh remain intact.

## Open Questions

- None for the generic slice. The final App labels, public identifiers, redirect registration details, and provider approval status are outputs of issue #60 and must not be invented here.
