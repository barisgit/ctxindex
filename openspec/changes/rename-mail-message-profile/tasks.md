## 1. Canonical mail Profile

- [x] 1.1 Add failing Profile/registry regression coverage for the exact `mail.message@1` identity, renamed Draft Actions and outputs, public exports/subpath, and absence of compatibility aliases.
- [x] 1.2 Rename the Profile file, schema-derived type, schema/Profile values, Draft schemas, reply helpers, Action ids/outputs, package subpath, root exports, and profile codemaps while preserving the email payload and pure vocabulary.
- [x] 1.3 Run the focused profiles and registry verifier tests, package typecheck, and package lint.

## 2. Official mailbox Adapter consumers

- [x] 2.1 Update Google mailbox Adapter imports, Profile references, normalization, Draft bindings/helpers, tests, fixtures, and codemap to use the exact renamed Profile values.
- [x] 2.2 Update Microsoft mailbox Adapter imports, Profile references, normalization, Draft bindings/helpers, tests, fixtures, and codemap to use the exact renamed Profile values.
- [x] 2.3 Run focused Google and Microsoft mailbox unit/integration tests plus adapter typecheck and lint.

## 3. Generic core and CLI surfaces

- [x] 3.1 Update current core/daemon/RPC fixtures and tests to use `mail.message` and verify generic `conversation`/`parent` Relation traversal remains Profile-neutral.
- [x] 3.2 Update CLI argument, command, describe, fixture, and interpreted/compiled workflow expectations and examples to expose only `mail.message` and `mail.message.draft.*`.
- [x] 3.3 Run focused core, daemon, RPC, and CLI tests including the compiled mailbox and registry workflows.

## 4. Current-facing specifications and documentation

- [x] 4.1 Update canonical and active-change specifications, implementation sidecars, SYSTEM/USER_REVIEW, web docs, skills, examples, and current design/reference material to the mail-specific vocabulary while preserving clearly historical archives and milestone records.
- [x] 4.2 Add and pass a stale-reference verifier that rejects `communication.message` vocabulary on current-facing surfaces with narrow historical exclusions.
- [x] 4.3 Refresh affected codemaps with the cartography skill and pass codemap parity/verifier tests.

## 5. Doctrine and final verification

- [x] 5.1 Promote the specified mail Profile, Draft binding, Profile-neutral thread traversal, and generic retrieval doctrine into all five canonical capability implementation sidecars.
- [x] 5.2 Run affected workspace build/typecheck/lint/unit/integration/e2e gates, including compiled extension workflows and strict `bunx openspec validate --all --strict`.
- [x] 5.3 Obtain an independent review, address actionable findings, and record the final scoped commit without archiving, pushing, or merging the change.
