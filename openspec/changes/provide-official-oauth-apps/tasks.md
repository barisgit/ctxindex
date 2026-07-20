## 1. Generic managed-App policy and resolution (no production ids)

- [ ] 1.1 Add failing core tests for exact `(providerId,label)` plus Extension distribution-provenance matching, absent policy, inactive App, provenance mismatch, duplicate policy, and explicit proof that App config/client ids and Adapter scopes are not selection inputs.
- [ ] 1.2 Implement the smallest immutable host policy type and pure managed-App resolver by reusing the current complete-registry OAuth App identities and retained provenance. Start production policy empty; accept only integrated provenance variants.
- [ ] 1.3 Add tests proving bundled and external Apps use the same `defineOAuthApp`/`defineExtension` graph, unreviewed Apps remain explicitly selectable, authored `official`/`managed` fields have no authority, and duplicate `(providerId,label)` identities still reject normally.
- [ ] 1.4 Run focused registry, extension-loading, OAuth App, SDK public-surface, architecture, and typecheck gates.

## 2. Deterministic CLI selection and BYOA fallback (no production ids)

- [ ] 2.1 Add failing parser/handler tests for `account add <provider>` managed resolution, explicit `--app <label>` override, zero/ambiguous/mismatched policy failures before effects, and unchanged Account label behavior.
- [ ] 2.2 Implement optional `--app` parsing and thin delegation to core. Keep exact App resolution authoritative after a managed label is selected; do not guess a local or unreviewed App.
- [ ] 2.3 Add provider-neutral synthetic authorization tests proving the selected managed App uses the unchanged Provider base plus all-active-Adapter scope union, including scopes from a community Extension, and that explicit BYOA requests the identical union.
- [ ] 2.4 Add stable failure/redaction tests: missing default is `invalid_oauth_selection` and exits `2` with `oauth-app add ... --from-env` plus `account add ... --app ...`; assert the existing exact mappings for auth, rate, quota/network, permission, and internal failures; append guidance without changing typed codes; prove no failure starts a second authorization or exposes config, secrets, state, codes, verifier, tokens, or raw responses.
- [ ] 2.5 Run focused Account parser/handler, OAuth App, authorization, scope, no-prompts, error-formatting, redaction, and egress gates.

## 3. Relocated and packaged generic acceptance

- [ ] 3.1 Add a synthetic Extension App fixture and host-policy fixture to CLI e2e, covering managed omission success, explicit local App override, provenance mismatch, offline startup, and safe inventory.
- [ ] 3.2 Extend relocated compiled-package coverage under Bun 1.3.14 without embedding Google/Microsoft client ids or contacting live providers.
- [ ] 3.3 Prove every request is limited to loopback and declared synthetic Provider hosts and that no ctxindex-operated endpoint is contacted.
- [ ] 3.4 Run compiled Extension/package, CLI e2e, architecture, package, and typecheck gates.

## 4. Close and merge the generic slice

- [ ] 4.1 Promote the generic managed-policy/resolution, same-SDK, unchanged-scope-union, provider-direct, and BYOA fallback doctrine listed in `implementation.md`; do not promote provider-specific activation claims.
- [ ] 4.2 Add generic managed-versus-explicit-App and BYOA fallback guidance without naming an unapproved production label or identifier.
- [ ] 4.3 Refresh affected codemaps through cartography and refresh `SYSTEM.md` through system-reference for the generic empty-policy behavior.
- [ ] 4.4 Run all sections 1–4 focused gates, `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change`; resolve every finding. The empty-policy generic slice is independently mergeable after this task.

## 5. Human and external Google activation checkpoint

- [ ] 5.1 Derive the exact current Google base-plus-active-Adapter scope union and redirect behavior from the loaded registry; prepare bounded issue #60 instructions without recording credentials or private provider data.
- [ ] 5.2 Human checkpoint: operator confirms the Google public desktop App, owned domain/branding/support/privacy/terms/deletion surfaces, redirect behavior, exact submitted scopes, verification state, and test-versus-production project separation. Keep only redacted outcome evidence outside Git.
- [ ] 5.3 After approval, add the ordinary `defineOAuthApp(googleProvider, { label, config })` leaf to the official Google Extension and one exact host-policy entry. Do not add a new factory, authored official flag, scope allowlist, placeholder id, secret, token, console artifact, backend, relay, or proxy.
- [ ] 5.4 Run Google definition, exact-scope, loopback, egress, Draft no-send, docs/package, and compiled-release tests. If approval is incomplete, leave Google BYOA-only.

## 6. Human and external Microsoft activation checkpoint

- [ ] 6.1 Derive the exact current Microsoft base-plus-active-Adapter scope union and redirect behavior from the loaded registry; prepare bounded issue #60 instructions without recording credentials or private provider data.
- [ ] 6.2 Human checkpoint: operator confirms the Microsoft public native App, publisher/domain state, supported account types, redirect behavior, exact permissions, tenant behavior, and support/privacy/terms/deletion surfaces. Keep only redacted outcome evidence outside Git.
- [ ] 6.3 After approval, add the ordinary `defineOAuthApp(microsoftProvider, { label, config })` leaf to the official Microsoft Extension and one exact host-policy entry with the same restrictions as task 5.3.
- [ ] 6.4 Run Microsoft definition, exact-scope, loopback, egress, Draft no-send, docs/package, and compiled-release tests. If approval is incomplete, leave Microsoft BYOA-only.

## 7. Close provider activation slices

- [ ] 7.1 For each activated provider, add managed-versus-explicit-App and BYOA fallback guidance to its owning Extension documentation tree without duplicating normative behavior or sensitive console artifacts.
- [ ] 7.2 Promote provider-specific activation doctrine, refresh affected codemaps and `SYSTEM.md`, and keep unapproved providers documented as BYOA-only.
- [ ] 7.3 After each provider activation slice, run its focused gates, `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change`; resolve every finding and do not archive without explicit request.

The independently mergeable generic slice is sections 1–4 with an empty production policy. Sections 5 and 6 are provider-specific activation slices gated by issue #60 and may land independently later, each closed by section 7.
