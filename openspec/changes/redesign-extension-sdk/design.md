## Context

External Extensions currently default-export a callback receiving host factories and Zod. Built-ins construct values through repository-local code and bypass external collection. Provider OAuth metadata is embedded in Adapters, while public Client records separately hold OAuth application configuration.

The approved direction is an ordinary TypeScript import graph. Package managers resolve package dependencies, authors import exact Provider and Profile values, and an Extension root composes Adapters and OAuth Apps. Core discovers roots from package-declared entries, transitively collects reachable leaves, validates the complete candidate registry, and activates it atomically.

## Goals / Non-Goals

**Goals:**

- Ordinary imports and exported shallow plain values with exact TypeScript inference.
- One supported schema surface re-exported as `z` by `@ctxindex/extension-sdk`.
- Exact imported Provider and Profile bindings with no string-reference authoring escape hatch.
- First-class providerless Adapters with no authorization or Provider contracts.
- First-class OAuth Apps with stable provider-scoped labels and one safe inventory.
- Type-compatible authoring across physical SDK/Zod copies with a conservative duplicate policy that never guesses executable equivalence.
- The same collection, validation, and activation semantics for built-ins and external packages.
- Source-neutral prerequisites for a dependent persistent direct installer without reimplementing package-manager dependency resolution.

**Non-Goals:**

- An Extension dependency graph or always-selected foundational Profiles Extension.
- Named or multiple auth methods, or speculative API-key/basic/custom auth.
- Init-time built-in selection UX.
- Sandboxing, signatures, MCP, or out-of-process Extensions.
- Compatibility aliases or callback invocation.
- Embedded definition documentation; documentation sidecars are deferred.
- Persisted direct-install provenance, local/Git/npm acquisition and trust policy, update/uninstall, or CLI.

## Decisions

1. **Authors use ordinary imports and exported values.** Entry modules import factories, types, `z`, Providers, Profiles, and other ordinary package exports, then export Extension values. The loader inspects the ESM namespace and never invokes an export. Named and default value exports are both supported.

2. **Package tooling owns dependency resolution.** npm, Git/local package materialization, workspaces, `package.json` dependencies, and exact TypeScript imports determine which code and values are available. ctxindex does not model `Extension.dependencies`, resolve an Extension dependency closure, or recreate a package manager. A future installer may acquire packages, but hands a materialized package to these seams.

3. **The SDK re-exports its supported `z`.** Authors use the SDK's supported schema surface without host injection. The SDK stays core-independent and side-effect-free.

4. **Factories preserve exact inference and return plain values.** `defineProfile`, `defineProvider`, `defineAdapter`, `defineOAuthApp`, and `defineExtension` shallow-copy inputs and add stable string discriminators. They neither register globals nor use custom prototypes or `instanceof`. There are no `extensionRef`, `providerRef`, or `profileRef` authoring fallbacks.

5. **Imported leaves form a value graph.** An Adapter contains its exact imported Profile values and, when applicable, one exact imported Provider value. An OAuth App contains its exact imported Provider. Starting from an Extension root, core transitively collects these reachable leaves. Explicit `providers` or `profiles` arrays are allowed only to publish standalone leaves not already reachable through an Adapter or OAuth App. Extension roots do not declare dependencies.

6. **`@ctxindex/profiles` is an ordinary library.** Canonical Profile modules are imported directly by Adapter packages and other authors. There is no Profiles-only Extension and no always-selected root. Missing Extension code does not delete stored data; stored Resource envelopes retain Profile `(id, version)`, and vocabulary availability honestly follows the currently loaded Profile definitions.

7. **Providerless Adapters are explicit.** An Adapter may omit `provider`. Such an Adapter has no Account or Grant, no auth declaration, no Provider-specific egress declaration, and no Provider access/scopes. Its own operation-level local I/O remains governed by its Adapter contract. A Provider-backed Adapter imports exactly one Provider and declares only Adapter-specific access requirements.

8. **Stable ids are semantic identity; root provenance is diagnostic only.** At most one non-conflicting Provider definition per stable Provider id may be active. Profile identity remains `(id, version)`; Adapter and Extension identities use stable ids; OAuth App identity is `(providerId, label)`. Package version, integrity, commit, physical path, and export location are retained for root diagnostics but never become leaf identity, equivalence evidence, or runtime selection keys.

9. **V1 coalescing is deliberately conservative.** Encountering the exact same imported non-App definition object more than once MAY coalesce it as evidence that authors reused the same value; object identity is never a semantic key, precedence rule, or winner between distinct values. Two distinct same-identity values conflict if either recursively contains a function or Zod schema because this change adds no package-authenticated per-leaf evidence capable of proving executable or schema equivalence. Two distinct genuinely pure declarative values MAY coalesce only when canonical structural equality proves them equal. OAuth App duplicates always conflict, including repetition of the same object. Separate physical SDK/Zod copies remain valid for authoring and structural validation, but executable definitions from separate copies do not coalesce merely because root version, integrity, commit, path, or function text appears equal.

10. **Auth cardinality stays at the proven surface.** A Provider declares exactly one direct `auth.oauth2({...})` or `auth.none()`. Named/multiple methods and unproven auth kinds remain deferred.

11. **OAuth App is a first-class leaf.** `defineOAuthApp(provider, { label, config })` requires an exact imported OAuth2 Provider. Its identity is `(providerId, label)`. Duplicate identity always rejects, including local BYOA collisions. Extension Apps are permitted only for public registration policy; confidential Apps remain local secret-backed BYOA or future hosted configuration. Public native-App metadata may include a provider-issued non-confidential desktop secret.

12. **Client disappears; Grant stays private and self-sufficient.** Account authorization selects an exact available OAuth App. Local BYOA configuration uses typed secret references. Grant snapshots the exact selected App configuration with tokens and permissions, so removing an App blocks only future authorization. Reauthorization replaces snapshots transactionally.

13. **OAuth App inventory is deliberately safe.** It exposes only Provider id, stable label, origin, and safe provenance. It never exposes App config, client ids, secret references, desktop-secret metadata, or secret values. Secret-backend traversal covers local BYOA and Grant snapshot references.

14. **All origins share collection and validation.** Built-in and external package entry namespaces pass through the same root collector, transitive leaf collector, structural validator, conservative duplicate policy, and atomic activation. Built-ins have distribution privilege only.

15. **Package entries remain manifest-owned.** A materialized package advertises contained ESM entry module paths through `package.json` `ctxindex.extensions`. Entries name modules, not export symbols. Each entry is imported once and all exported Extension roots are considered. Exact selection is a host/acquisition concern layered after collection.

16. **Direct install remains separate.** This change supplies source-neutral package-entry, collection, exact-selection, and complete-registry seams. Existing Catalog/explicit-path flows delegate to them. A dependent OpenSpec change owns generic persisted provenance, acquisition/trust, update/uninstall, and CLI. It must use the ecosystem package resolver rather than inventing dependency resolution.

17. **Documentation is deferred.** Runtime definition values do not embed `docs`. Human and agent documentation will use separately versioned sidecars in a later accepted change, so docs do not affect definition equivalence or activation.

18. **The pre-alpha schema uses OAuth App names directly.** Fresh storage uses `oauth_apps` and Grant-owned App snapshot fields, with no Client compatibility table, view, migration, or command alias.

19. **The CLI names and selects OAuth Apps exactly.** Local BYOA lifecycle is `oauth-app add <provider> <label> --from-env`, `oauth-app list [--json]`, and `oauth-app remove <provider> <label>`. There is no `client` command or alias. `account add <provider> --app <label> [--label <label>]` requires the exact Provider-scoped App label and never guesses even when only one App exists. Inventory projects identity and safe provenance only.

20. **Environment input is Provider-authored and one-shot.** OAuth registration metadata contains a typed mapping from every top-level App config key to a safe environment variable name. Only local BYOA `oauth-app add --from-env` consumes that mapping. It reads values through the central environment loader, validates the complete config before persistence, and stores values as typed secret references. Extension Apps do not read this mapping. Authorization and refresh never reread environment config; the selected App is snapshotted into its private Grant.

21. **Validation precedes effects and error vocabulary follows Apps.** Unknown Providers or Apps fail before environment/secret reads, database mutation, browser launch, or Provider egress. Missing or invalid environment-derived config fails after input inspection but before secret-store writes, database mutation, or network activity. The auth error `missing_oauth_app_config` replaces `missing_oauth_client_creds` with the same stable exit mapping; the old code is not retained as an alias.

## Risks / Trade-offs

- [Independent physical copies cannot prove executable equivalence] → Keep them authoring/type-compatible, but conflict distinct same-id function/schema-bearing values in V1. Permit exact-object reuse for non-App definitions and canonical equality only for genuinely pure declarative values; never infer leaf equivalence from root provenance, function text, or load order.
- [Transitive collection could miss a standalone leaf] → Allow explicit `providers` and `profiles` arrays only for leaves not reachable through Adapters or OAuth Apps, and test graph completeness.
- [No always-loaded Profiles package reduces vocabulary after code removal] → Preserve stored Profile ids/versions and searchable Resource envelopes, but report unavailable vocabulary honestly rather than introducing a privileged Extension.
- [An OAuth App collision could replace credentials] → Reject duplicate `(providerId, label)` identities without priority or config fingerprints.
- [Removing an App could strand Accounts] → Refresh uses Grant-owned App snapshots, independent of current inventory.
- [A public native App contains desktop-secret metadata] → Gate on public registration policy and keep all App config out of inventory.
- [A future installer could fork activation or dependency behavior] → Require it to materialize packages with standard package tooling and delegate to these source-neutral seams.

## Migration Plan

Correct the SDK value graph first, including removal of reference/dependency APIs and addition of providerless Adapters. Then implement deterministic complete-registry collection, OAuth App/private Grant behavior, common manifest-entry loading, Catalog delegation, built-in migration, CLI vocabulary migration, and external fixtures. Remove callback and Client seams only after all callers use the new path. The dependent direct-install change follows without adding a second dependency resolver or activation path.

## Open Questions

None.
