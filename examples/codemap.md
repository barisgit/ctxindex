# examples/

## Responsibility

Houses external Extension examples that demonstrate the public authoring contract through deterministic fixtures and bounded provider integrations. The providerless tender fixture is detailed in `examples/tenders-extension/codemap.md`; the OAuth provider-backed issue-search graph is detailed in `examples/issues-extension/codemap.md`; the credential-free GitHub REST sync demo is detailed in `examples/github-issues-extension/codemap.md`.

## Design/patterns

- Each example is a root workspace package: `package.json` declares ordered `ctxindex.extensions` module entries, runtime authoring dependencies, and any test-only public-package dependencies.
- `examples/tenders-extension/extension.ts` exports ordinary SDK definition values and declares the adjacent `docs/` tree; `fixtures.ts` provides immutable typed inputs.
- The example composes a strict schema, Profile, Adapter, and Extension under stable `enarocanje.*` IDs.
- `examples/issues-extension/extension.ts` composes a strict issue Profile, OAuth Provider, public App, scoped remote-search Adapter, Extension root, and adjacent documentation tree under stable `example.*` IDs.
- `examples/github-issues-extension/extension.ts` composes a strict `software.issue@1` Profile, `auth.none()` public GitHub Provider, host-scoped indexed sync Adapter, Extension root, and documentation tree under stable `github.*` and `ctxindex.github-issues-demo` IDs; `website-handoff.ts` keeps the live-demo setup contract available to the website.

## Data & control flow

1. Core resolves `package.json`'s `./extension.ts` entry, imports its module namespace once, and binds the Extension's `docs('./docs')` descriptor to that acquired module URL.
2. Export collection selects the ordinary `enarocanje.proof` Extension root and reaches its exact Profile/Adapter values; `operations.sync(context)` iterates `TENDER_FIXTURES`.
3. Sync emits source-scoped `upsertResource` operations and then a versioned `checkpoint` through `context.emit()`.
4. The providerless Adapter performs no Account, Grant, token, or Provider egress resolution.
5. The issue Adapter receives only host-scoped provider fetch, validates Source configuration and provider JSON, and normalizes remote results into `example.issue@1` Resources.
6. The GitHub Adapter follows validated, bounded REST pagination through injected fetch, excludes pull requests, reconciles its complete Source snapshot with upserts/removals, and checkpoints sorted issue numbers with a one-page-only ETag fast path.

## Integration points

- Workspace boundary: the root manifest includes `examples/*`; the dependency verifier scans each example's production and test imports while allowing dependencies only on public `packages/*` workspaces.
- Public authoring API: `@ctxindex/extension-sdk` factories and SDK-exported `z`, declared as a runtime `workspace:*` dependency. `@ctxindex/core` and `@ctxindex/adapters` are test-only `workspace:*` dev dependencies for package discovery and built-in isolation checks.
- Fixture input: `examples/tenders-extension/fixtures.ts` (`TENDER_FIXTURES`, `TenderFixture`).
- Runtime boundary: package-entry discovery, exported-value collection, complete-registry validation, and sync `context.emit()`.
- Provider-backed proof: `examples/issues-extension/` uses reserved `.invalid` endpoints and a test-injected fetch fixture; no live provider egress or secret state is required.
- Public-network demo: `examples/github-issues-extension/` allows only `api.github.com`, uses `auth.none()` with no stored credential, and documents a manual public-repository sync. Its tests inject response fixtures rather than contacting GitHub.
