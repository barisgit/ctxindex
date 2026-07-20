## 1. Public SDK plain-value graph

- [x] 1.1 Add public-surface and compile-time fixtures for ordinary imports, SDK-exported `z`, fresh discriminated plain values, and exact inference across the five definition factories.
- [x] 1.2 Replace reference/dependency fixtures with failing proofs that Adapters and OAuth Apps require exact imported Provider/Profile values, Extensions have no dependency graph, and Extension roots retain exact transitive leaf types.
- [x] 1.3 Update negative proofs for direct `oauth2`/`none`, no host callback or injected Zod, no named/multi-method or placeholder auth, and no global registration, prototype, or `instanceof` contract.
- [x] 1.4 Add failing SDK tests for providerless Adapters and optional explicit standalone Provider/Profile arrays; prove providerless definitions cannot declare Account/Grant/auth/provider egress/access fields.
- [x] 1.5 Implement the corrected core-independent SDK surface, remove `extensionRef`/`providerRef`/`profileRef` and embedded `docs`, then run SDK unit/public-surface tests, compile fixtures, typecheck, lint, and architecture checks.

## 2. Transitive complete registry

- [x] 2.1 Replace dependency/foundational-root tests with failing tests for transitive Provider/Profile collection through Adapters and OAuth Apps, standalone explicit leaves, and `@ctxindex/profiles` as an ordinary imported library.
- [x] 2.2 Add duplicate-policy tests proving exact same imported non-App objects may coalesce as exact reuse, distinct function/schema-bearing same-id values conflict, distinct genuinely pure declarative values coalesce only by canonical structural equality, OAuth App duplicates always conflict, and all conflicts reject atomically.
- [x] 2.3 Add identity tests for Provider id, Profile `(id, version)`, Adapter id, Extension id, and OAuth App `(providerId,label)`, including conflicting schemas and executable leaves.
- [x] 2.4 Add providerless Adapter validation/runtime tests proving no Provider, Account, Grant, Provider egress, or Provider access/scopes are required or synthesized.
- [x] 2.5 Implement staged graph collection, conservative executable/schema duplicate rejection, canonical structural equality for pure declarative values, diagnostic-only root provenance, complete candidate validation, and atomic activation; run focused registry, Profile payload/version, Action/capability, degraded-loading, and order-independence tests.

## 3. OAuth App authoring, identity, and safe inventory

- [x] 3.1 Add failing tests for `defineOAuthApp(provider, { label, config })`, exact imported-Provider config inference, stable `(providerId,label)` identity, required labels, transitive collection, and automatic inventory.
- [x] 3.2 Prove Extension Apps require public Provider registration, confidential Extension Apps reject, `none` Providers reject Apps, public native metadata may contain a non-confidential desktop secret, and OAuth registration exposes a typed complete top-level config-key-to-environment-name map.
- [x] 3.3 Prove built-in, external, Catalog, and local BYOA Apps never shadow at one identity and replacement requires the current owner to be absent.
- [x] 3.4 Implement the unified Extension/local OAuth App registry and safe inventory exposing only Provider id, label, origin, and safe provenance.
- [x] 3.5 Run focused OAuth App SDK, registry, formatting/redaction, duplicate, and Provider-policy tests.

## 4. Local BYOA and private Grant snapshots

- [x] 4.1 Add fresh-storage tests for `oauth_apps`, typed secret-backed local config, Grant-owned App snapshots, and absence of Client tables, aliases, migrations, commands, and public vocabulary.
- [x] 4.1a Add `oauth-app add --from-env` tests proving Provider-mapped top-level config import, full schema validation before persistence, no literal config argv, cleanup on write failure, and zero secret/database/network effects for unknown selection or invalid/missing config.
- [x] 4.2 Add authorization tests for exact App-label selection before effects, exact config snapshotting, and no public Grant selector.
- [x] 4.3 Add lifecycle tests proving App removal affects only future authorization, refresh uses snapshots, reauthorization safely replaces snapshots, and existing retry rules remain.
- [x] 4.4 Add secret-backend traversal/switch tests for local App config refs, Grant snapshot refs, and token refs with copy/verify-before-cleanup and redaction coverage.
- [x] 4.5 Implement persistence, Account/private Grant snapshotting, refresh, reauthorization replacement, and secret traversal; run focused storage/auth/Account/Source/secret/loopback/Action tests.

## 5. Common manifest-entry collection

- [x] 5.1 Add failing collector tests for named/default Extension exports, multiple roots, unrelated exports, invalid claimed discriminators, callback non-invocation, export-scoped root provenance, transitive leaves, standalone arrays, exact-object reuse, and authoring/type compatibility across independent SDK/Zod copies without executable coalescing.
- [x] 5.2 Add failing `package.json` `ctxindex.extensions` tests for ordered unique contained module paths, one import per entry, no export-symbol selectors, traversal/escaping-symlink/missing-file rejection, and exact Extension selection with absence/ambiguity diagnostics.
- [x] 5.3 Implement source-neutral manifest-entry resolution, exported-root collection, transitive graph collection, exact selection, and complete candidate validation without Catalog types or package dependency resolution.
- [x] 5.4 Route bundled built-ins, explicit paths, and installed Catalog snapshot loading/install validation through the same seams while preserving trust, immutable provenance, startup-offline behavior, and per-package atomic failure.
- [x] 5.5 Run focused loader, manifest-entry, explicit-path, Catalog service/e2e, missing-Extension, provenance, and architecture checks.

## 6. Built-in and external migration

- [x] 6.1 Add failing bundled-definition tests for ordinary imported Profiles, Provider-owned auth/registration, exact imported Provider/Profile bindings, providerless local Adapters, unchanged scopes/hosts/operations, and an explicitly empty OAuth App inventory until approved public metadata is supplied.
- [x] 6.2 Migrate every existing built-in Profile, Provider, OAuth App, Adapter, and Extension to ordinary SDK factories and exported values; collect built-in namespaces instead of pre-registering them.
- [x] 6.3 Keep `@ctxindex/profiles` an ordinary library and express workspace/package dependencies through package manifests and exact imports, with no foundational Extension or dependency graph.
- [x] 6.4 Rewrite the external example and relocated compiled fixture to use `ctxindex.extensions`, ordinary SDK imports, relative TypeScript, and package-managed dependencies under Bun 1.3.14.
- [x] 6.5 Run Profiles/Adapters tests, built-in registry assertions, Google/Microsoft/local workflows, egress/no-send checks, external example e2e, compiled-extension gate, and architecture checks.

## 7. Public vocabulary and obsolete seam removal

- [x] 7.1 Replace Client commands/descriptions/skills/formatters/tests with `oauth-app add <provider> <label> --from-env`, `oauth-app list [--json]`, `oauth-app remove <provider> <label>`, and `account add <provider> --app <label> [--label <label>]`; require exact App selection and keep Grant private.
- [x] 7.1a Remove the `client` command and aliases, reject literal App config/secret argv, and prove inventory exposes only Provider id, App label, origin, and safe provenance.
- [x] 7.1b Rename `missing_oauth_client_creds` to `missing_oauth_app_config` across public/internal errors and guards without an alias; prove unchanged stable exit mapping and add-time invalid usage exit `2`.
- [x] 7.2 Remove `ExtensionAuthoringHost`, callback diagnostics, embedded Adapter auth, reference/dependency APIs, alternate built-in registry paths, Client storage/API aliases, and embedded definition docs without unrelated cleanup.
- [x] 7.3 Add guards for removed seams and unsafe inventory fields, then run CLI thinness, package dependency, public-surface, redaction, and fresh-schema checks.

## 8. Doctrine, follow-up boundary, and final verification

- [x] 8.1 Promote the accepted behavior into the eight capability specs and deferred implementation sidecars, update `CONTEXT.md`, and refresh affected codemaps plus `SYSTEM.md` using their owning skills.
- [x] 8.2 Create the dependent `add-direct-extension-installation` OpenSpec change for GitHub issue #63 on branch `feature/direct-extension-installation`. It owns generic provenance, local/Git/npm acquisition and trust, update/uninstall, and CLI; it must use package-manager dependency resolution and reuse this change's manifest-entry/collector/selection/registry seams.
- [x] 8.3 Record built-in selection UX and documentation sidecars as deferred; verify no Profiles root, Extension dependency graph, or embedded docs remains.
- [x] 8.4 Run all focused package/e2e checks, `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change` before archive.
