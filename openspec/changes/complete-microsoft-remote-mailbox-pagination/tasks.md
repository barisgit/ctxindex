## 1. Provider-neutral continuation contract

- [x] 1.1 Add failing Extension SDK, CLI argument, planner, and remote-source tests for optional opaque continuation, constrained query-less `--remote`, exact-one-Source selection, unchanged local pagination JSON, remote pagination JSON, cursor pass-through, and all invalid offset/continuation combinations before I/O.
- [x] 1.2 Implement the minimal SDK/core/CLI contract and keep provider-neutral boundaries; pass `bun test packages/extension-sdk/src packages/core/src/search packages/core/src/source/remote-search.test.ts apps/cli/src/args/search.test.ts apps/cli/src/commands/search.test.ts` plus focused typecheck/architecture checks before continuing.

## 2. Microsoft mailbox resumable enumeration

- [x] 2.1 Add failing Microsoft mailbox tests for query-less constrained enumeration, documented exact `unread=true`/`false` translation, Source-and-query-bound continuation validation, 50-result continuation, resumed-page immutable-id headers, cross-page duplicate/Draft suppression, and malformed/oversized provider pages.
- [x] 2.2 Implement bounded versioned Microsoft cursor handling, omitted match-all `$search`, exact unread `$filter`, and supported combined text/unread verification while preserving Graph next-link validation and Profile-backed verification; pass `bun test packages/adapters/src/microsoft/mailbox/search-remote.test.ts packages/core/src/source/remote-search.test.ts` before continuing.

## 3. Generic CLI workflow and guidance

- [x] 3.1 Extend the loopback Graph mock plus provider-neutral Outlook CLI workflow tests first to prove query-less recent/unread enumeration and two resumable pages beyond 50 with immutable Refs, no overlap, no Drafts, deterministic JSON metadata, and negative mode combinations using only synthetic credentials.
- [x] 3.2 Update generated search help and `.agents/skills/repo-development/SKILL.md` guidance without changing bundled orientation; pass focused CLI integration, compiled Outlook e2e, skills-content, generated-interface, and architecture gates.

## 4. Doctrine, maps, and final verification

- [x] 4.1 Promote the continuation interfaces/data flow and Microsoft cursor/unread doctrine into `openspec/specs/search-routing/implementation.md` and `openspec/specs/microsoft-graph-adapters/implementation.md`, refresh affected codemaps through the cartography skill, and run documentation/drift checks.
- [x] 4.2 Run focused package tests, `bun run ci`, `bunx openspec validate --all --strict`, and the `openspec-verify-change` workflow; address all findings and obtain independent read-only review.
