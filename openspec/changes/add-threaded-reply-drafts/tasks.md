## 1. Portable profile contract

- [x] 1.1 Add failing profile/schema tests for strict standalone/reply unions, rejected mixed overrides, optional threading payload fields, deterministic recipient/subject/References helpers, and immutable `replyToRef` output.
- [x] 1.2 Implement the minimal portable schemas, payload fields, exports, helpers, examples, and generated-description expectations; pass focused profile and registry-interface tests.
- [x] 1.3 Slice gate: run all `@ctxindex/profiles` and affected extension-sdk registry tests.

## 2. Source-scoped local Action resolution

- [x] 2.1 Add failing core Action tests proving the resolver exposes complete/deleted/incomplete local Resource state, rejects missing and cross-Source Refs, and runs before auth/provider I/O.
- [x] 2.2 Extend the public Action context and generic core Action orchestration with the smallest Source-scoped local resolver; pass focused SDK/core tests and architecture checks.
- [x] 2.3 Slice gate: run affected extension-sdk/core package tests and CLI malformed-input zero-side-effect tests.

## 3. Gmail threaded reply Drafts

- [x] 3.1 Add failing Gmail normalization, Draft adapter, mock, and CLI tests for Reply-To/References extraction, parent eligibility, exact threadId and MIME reply headers, derived recipient/subject, immutable reply update parent, one mutation, stable Ref, zero-I/O failures, no retry, and no send route.
- [x] 3.2 Implement Gmail reply create/update through the existing Draft endpoints and portable resolver/helpers, preserving standalone behavior and complete normalized results.
- [x] 3.3 Slice gate: run focused Gmail adapter, mock, compiled CLI Draft workflow, and no-send tests.

## 4. Microsoft threaded reply Drafts

- [x] 4.1 Add failing Microsoft normalization, Draft adapter, Graph mock, and CLI tests for Reply-To/References extraction, local parent/target validation, native `createReply`, one-shot PATCH, immutable `replyToRef`, stable immutable Draft Ref, zero provider reads/retries, and no send route.
- [x] 4.2 Implement native Graph reply create and local-proof reply update without provider reads, preserving standalone behavior and complete normalized results.
- [x] 4.3 Slice gate: run focused Microsoft adapter, Graph mock, compiled multi-provider workflow, auth-scope, and no-send tests.

## 5. Doctrine, generated docs, and final verification

- [x] 5.1 Refresh generated documentation expectations and affected codemaps/System projection where required, without duplicating normative truth.
- [x] 5.2 Promote applicable doctrine into every canonical capability implementation sidecar named by `implementation.md`.
- [x] 5.3 Run `bun run ci`, `bunx openspec validate --all --strict`, `openspec-verify-change add-threaded-reply-drafts`, and `git diff --check`; resolve every critical or warning-level divergence.
- [x] 5.4 Perform an independent final nested review for correctness, regressions, security, contract drift, and missing verification.
