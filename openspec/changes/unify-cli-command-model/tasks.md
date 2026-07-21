## 1. Declarative command foundation

- [ ] 1.1 Add failing type/runtime tests for Citty-owned parsed arguments, generic unknown/duplicate/surplus validation, full command paths, enum/default/required help, root-only guidance, and zero effects on invalid usage.
- [ ] 1.2 Implement the shared `defineCtxCommand`, strict definition-derived validation, complete-path help resolver, and command-reference projection without command-specific grammar branches.
- [ ] 1.3 Migrate global log-level handling and dynamic `source add` argument generation through the authoritative resolved Citty definitions.
- [ ] 1.4 Slice gate: pass command-foundation, main, dynamic Source help, malformed-zero-effect, architecture, and CLI-framework tests plus CLI typecheck/lint.

## 2. Public command migration and simplification

- [ ] 2.1 Add failing table-driven tests that enumerate every retained and removed command path and verify complete `--help` for all reachable commands.
- [ ] 2.2 Migrate Realm, Source, OAuth App, Account, secrets, sync, search, status, get, export, skills, init, daemon, and Extension Catalog authoring/read handlers to typed Citty arguments; remove their parallel parsers and usage strings.
- [ ] 2.3 Implement `thread <ref>`, `artifact purge`, and source-aware `describe action <id> --source`; remove `thread get`, top-level `purge`, and `action describe` with zero-effect invalid-usage coverage.
- [ ] 2.4 Implement singular `extension`, `extension catalog search`, and uniform `extension install <catalog|npm|git|local> <target> <extension-id>` grammar; remove plural and overloaded routes without aliases.
- [ ] 2.5 Slice gate: pass every CLI unit/integration test, generated-help traversal, bundled-skill command audit, and CLI thin/framework/architecture checks.

## 3. Provenance-aware Extension update

- [ ] 3.1 Add failing core and CLI tests for direct update, Catalog-curated update, exact recorded Catalog refresh, missing Catalog/entry, stale snapshot, origin collision, replay failure, and prior-record preservation.
- [ ] 3.2 Implement one provider-neutral installed lifecycle update seam that dispatches from persisted direct or Catalog curation provenance and reuses canonical acquisition, replay, lifecycle lock, snapshot compare-and-swap, and atomic publication.
- [ ] 3.3 Wire `extension update <id>` to the generic service and emit deterministic trust/provenance output for both origins.
- [ ] 3.4 Slice gate: pass direct/Catalog lifecycle, race, durability, provenance, CLI integration, and compiled Extension workflow tests.

## 4. Offline documentation consumer

- [ ] 4.1 Add failing tests for deterministic bundled-document validation, Extension projection adaptation, exact origin/path selection, bounded search/snippets, safe inventory, Markdown/JSON output, explicit asset copy, unsafe paths, and no network or web runtime.
- [ ] 4.2 Implement a deterministic build-time bundled product-documentation manifest with explicit path, reference, file, asset, and byte bounds.
- [ ] 4.3 Implement the transport-neutral documentation source/service composition over bundled and loaded Extension documentation.
- [ ] 4.4 Implement typed `docs list|get|search` commands and text/JSON/asset presentation without Markdown rendering or binary terminal output.
- [ ] 4.5 Slice gate: pass documentation service/CLI tests, Extension documentation security/projection tests, package build, and relocated offline compiled CLI docs E2E.

## 5. Generated reference and guidance synchronization

- [ ] 5.1 Implement deterministic Markdown generation from the command-reference projection and a freshness test; replace handwritten per-command web reference pages with one generated secondary page.
- [ ] 5.2 Update README, bundled skills, task-oriented web guides, examples, and shell fixtures to the accepted command grammar while keeping loaded facts derived through `describe`.
- [ ] 5.3 Add a repository-wide stale-command audit that rejects removed plural Extension, `thread get`, top-level purge, and duplicate Action describe examples outside historical archives.
- [ ] 5.4 Slice gate: regenerate reference, pass documentation/link/content tests, bundled skills E2E, web typecheck/build, CLI package pack/smoke, and `git diff --check`.

## 6. Doctrine, maps, and final verification

- [ ] 6.1 Sync accepted delta requirements into current capability specs and promote implementation doctrine into `cli-surface`, `documentation-consumption`, `extension-documentation`, and `extension-installation` sidecars.
- [ ] 6.2 Refresh affected CLI, core Extension/installation/documentation, package, web, and repository codemaps through cartography.
- [ ] 6.3 Refresh `SYSTEM.md` CLI, Extension lifecycle, documentation, limitations, and source-index sections against canonical specs.
- [ ] 6.4 Run focused regression suites, `bun run ci`, `bunx openspec validate --all --strict`, compiled/relocated package verification, and `openspec-verify-change`.
- [ ] 6.5 Obtain independent code and documentation reviews, fix every critical/important finding, rerun affected gates, and leave a clean locally mergeable branch.
