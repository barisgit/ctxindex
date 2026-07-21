## 1. Portable skill retrieval

- [x] 1.1 Add a failing public CLI test for `docs get-skill` exact text, deterministic JSON, safe explicit output, and service/daemon independence.
- [x] 1.2 Add canonical `skills/ctxindex/SKILL.md`, build-time frontmatter/content validation and embedding, and the minimal docs command implementation; pass focused docs and command-model tests.
- [x] 1.3 Add a failing relocated compiled-package assertion, then prove `docs get-skill` preserves exact canonical bytes without checkout access.

## 2. Remove redundant skills surface

- [x] 2.1 Add parsing/help assertions that the generic `skills` group is absent, then remove its command definitions, source assets, loader/manifest/runtime modules, and focused tests without compatibility aliases.
- [x] 2.2 Update no-prompt, generated reference, package, repository-guidance, and drift assertions to use `docs get-skill`; pass focused affected suites and architecture gates.

## 3. Doctrine and final verification

- [x] 3.1 Refresh affected codemaps and promote applicable doctrine into the canonical `cli-surface` and `documentation-consumption` implementation sidecars; confirm `search-routing` needs no doctrine change.
- [x] 3.2 Run `bun run ci`, `bun run test:integration`, `bun run test:e2e`, `bunx openspec validate --all --strict`, and `openspec-verify-change`.
