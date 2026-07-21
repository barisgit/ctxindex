## Why

The current Extension seam is a host-invoked callback with injected factories and Zod. It makes Extensions unlike ordinary TypeScript packages, gives built-ins a privileged registration path, and embeds OAuth application setup in local Client state instead of authored definitions.

The public SDK needs one ordinary, inferable value model for built-ins and third parties. Package managers and TypeScript imports should resolve dependencies; ctxindex should only discover Extension entry modules, collect their exported value graphs, validate a complete candidate registry, and activate it atomically.

## What Changes

- **BREAKING**: Extension entry modules use ordinary imports and export plain definition values. The host never invokes an authoring callback, and `@ctxindex/extension-sdk` re-exports its supported `z`.
- **BREAKING**: Provider and Profile bindings require exact imported definition values. The SDK exposes no `extensionRef`, `providerRef`, or `profileRef` authoring fallback and no Extension dependency graph.
- Extension roots transitively collect Provider and Profile leaves reachable through imported Adapters and OAuth Apps. Optional explicit `providers` and `profiles` arrays are only for standalone leaves not otherwise reachable.
- `@ctxindex/profiles` remains an ordinary package of reusable Profile values, not an always-selected or privileged Profiles Extension. Package manifests and exact TypeScript imports express dependency ownership.
- Providerless Adapters are first-class. They declare no Account, Grant, auth, Provider egress, or Provider access requirements.
- Add first-class OAuth App leaves authored as `defineOAuthApp(provider, { label, config })`. `(providerId, label)` is the stable selector; duplicate Apps reject, BYOA never shadows, and every activated or local App appears in one safe inventory. Extension-provided Apps require public Provider registration; confidential Apps remain local secret-backed BYOA or future hosted configuration.
- Remove public Client vocabulary. Accounts select an OAuth App; Grant remains private and snapshots the selected App configuration so refresh survives App removal.
- Replace the public Client CLI with exact OAuth App commands: `oauth-app add <provider> <label> --from-env`, `oauth-app list [--format json]`, and `oauth-app remove <provider> <label>`. `account add <provider> --app <label> [--label <label>]` always requires the exact App label. Provider registration metadata maps typed top-level App config keys to environment variable names solely for local BYOA import; no literal config or secret argv is accepted.
- Rename internal/public error code `missing_oauth_client_creds` to `missing_oauth_app_config` without changing its stable exit behavior. Unknown selections and invalid or missing add-time config fail before secret-store writes, database mutation, or network effects.
- Built-in and external modules use the same exported-value collector, transitive graph collector, conservative duplicate policy, and atomic activation. Stable ids remain semantic identity. The exact same imported non-App definition object may deduplicate as evidence of exact reuse, but object identity never selects a semantic winner. Distinct values containing any function or Zod schema conflict; only genuinely pure declarative values may coalesce by canonical structural equality. OAuth App duplicates always conflict.
- Package entry discovery remains the `package.json` `ctxindex.extensions` field. Existing Catalog and explicit-path loading delegate to source-neutral entry/collection/selection/validation seams.
- Definition documentation is deferred to separate sidecars rather than embedded `docs` fields.
- Persisted direct installation from local, Git, npm, or package targets remains a dependent OpenSpec change. This change does not reinvent package-manager dependency resolution.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `core-model`: Define imported-value Provider/Profile relationships, providerless Adapters, OAuth Apps, and private Grants.
- `extension-loading`: Replace host callbacks with package-declared exported values and unify built-in/external collection and validation.
- `oauth-client-management`: Replace public Client records with OAuth Apps keyed by `(providerId, label)` and deterministic Account selection.
- `account-grant-management`: Authorize Accounts through selected OAuth Apps while keeping Grants private and providerless Adapters authorization-free.
- `module-architecture`: Establish the public SDK, package/import dependency boundary, shared collector/registry path, and deferred documentation sidecars.
- `cli-surface`: Replace Client commands and guessing with exact OAuth App lifecycle and Account selection commands.
- `secret-backend-operations`: Define one-time Provider-mapped environment import, typed App/Grant secret references, and environment-independent authorization/refresh.
- `error-taxonomy`: Rename the missing OAuth configuration error while preserving stable exit behavior and zero-effect validation failures.

## Impact

The migration affects the SDK, built-in definitions, registry and loader, OAuth authorization, OAuth App/Account CLI, error names, secret traversal, Catalog delegation, examples, compiled external-Extension proof, architecture gates, and affected implementation sidecars. Stored Resource payloads remain explicitly Profile-versioned.

Pre-alpha callback Extensions must migrate to ordinary imports and exported values. Existing user OAuth configuration becomes a local BYOA OAuth App without a legacy Client alias. Catalog records remain an acquisition source, while persistent direct install provenance, trust, update/uninstall, and CLI are left to the dependent change.
