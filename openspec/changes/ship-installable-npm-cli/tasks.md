## 1. Public package and contributor build

- [x] 1.1 Add failing package-contract tests for the private root, public unscoped CLI manifest, built bin, Bun pin, native dependency boundary, and absence of runtime `workspace:*` dependencies.
- [x] 1.2 Implement the Bun-target CLI bundle, public package metadata, root/package scripts, lockfile updates, and documented build plus `bun link` contributor flow.
- [x] 1.3 Pass the package-contract tests, CLI typecheck/build, dependency architecture gate, and linked-bin help smoke in isolated state.

## 2. Safe deterministic pack

- [x] 2.1 Add failing verifier tests for archive allowlisting, sensitive filename/content rejection, runtime workspace dependency rejection, path safety, and normalized member/content digests.
- [x] 2.2 Implement the package archive verifier and deterministic build/pack commands so one exact tarball path flows to downstream checks.
- [x] 2.3 Build and pack twice from unchanged source, prove identical normalized members/content, and pass the focused verifier tests and package dry-run audit.

## 3. Exact-tarball relocated installation

- [x] 3.1 Add a failing integration test that globally installs the exact tarball under a temporary Bun home and invokes it outside the checkout with isolated ctxindex state.
- [x] 3.2 Extend the isolated smoke through help, bundled skills, fresh init/SQLite migration, native Bun behavior, and an explicit-path manifest-declared package-root TypeScript Extension.
- [x] 3.3 Pass the exact-tarball smoke plus existing compiled Extension, catalog, skills, native/concurrent SQLite, and relocated runtime workflow tests required by this slice.

## 4. Trusted release automation

- [x] 4.1 Add failing release-contract tests for a `main` push trigger, named CI/build/pack/smoke/publish stages, pinned Bun 1.3.14 and actions, GitHub-hosted execution, concurrency, strict version-increase detection, idempotent existing-version skip, unchanged-unpublished and registry-error failure, exact-artifact reuse, least permissions, protected environment, and tokenless OIDC publication.
- [x] 4.2 Implement `.github/workflows/release.yml` using repository build/pack/smoke commands and npm trusted publishing without npm credentials.
- [x] 4.3 Pass release-contract and existing GitHub Actions verification gates.

## 5. Documentation, doctrine, and final verification

- [x] 5.1 Update installation, contributor linking, release, and first-publish setup documentation, including exact npm trusted-publisher and GitHub environment requirements.
- [x] 5.2 Promote distribution doctrine into `openspec/specs/cli-distribution/implementation.md` and refresh affected codemaps plus `.slim/cartography.json` through the cartography script.
- [x] 5.3 Run `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change`; resolve every failure before completion.

## 6. First publish Human checkpoint

- [ ] 6.1 Human checkpoint: inspect the MIT-licensed final tarball, verify live npm package ownership/version availability, manually bootstrap the exact artifact with owner 2FA, configure npm trusted publisher for `barisgit/ctxindex`, `release.yml`, and `npm-production`, protect that GitHub environment, and explicitly approve later OIDC publishing. Do not publish or request credentials during automated implementation.
