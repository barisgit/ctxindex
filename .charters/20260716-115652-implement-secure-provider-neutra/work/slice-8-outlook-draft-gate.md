# Slice 8 Outlook Draft Actions gate

Date: 2026-07-16
Change: `multi-provider-context-access`
Scope: OpenSpec tasks 8.1–8.6; loopback Graph fixtures only, with no live Microsoft traffic or private credential access.

## Result

Passed. `microsoft.mailbox@1` now binds the same provider-neutral reversible Draft create/update Actions as Gmail while retaining the existing `Mail.ReadWrite` Grant and exposing no send capability.

- Create validates the strict shared Action input and Graph recipient syntax before provider egress, then performs exactly one `POST /me/messages` with immutable-id and text-body response preferences.
- Update requires an exact uppercase same-Source canonical `ctx://<SOURCE>/draft/<immutable-id>` Ref, performs exactly one `PATCH /me/messages/{id}`, and completely replaces or clears to/cc/bcc/subject/text fields.
- Both Actions require an authoritative complete Graph Draft response, reject mismatched/non-Draft/malformed responses, preserve the same immutable Draft Ref, normalize through `communication.message@1`, and rely on generic `runAction` for one local materialization including an absent-local update.
- Graph errors retain typed taxonomy and mutations are never retried. No follow-up retrieval is needed.
- The stateful loopback Graph mock and compiled CLI workflow prove invalid input has zero Graph requests or Draft rows; one create and update use only POST/PATCH; cached get and JSON export add no requests; unknown send adds no requests.
- Adapter declarations expose exactly the two reversible Profile Actions with `Mail.ReadWrite`. `Mail.Send`, send Action ids, and `/send` routes remain absent.

## Corrections found during verification

1. Recipient strings are translated from the shared header-style form into Graph `emailAddress` objects, preserving optional display names and non-ASCII text while rejecting malformed angle-address syntax before provider egress.
2. The first full CI precheck exposed two stale built-in registry expectations from Slice 7: Microsoft had intentionally advertised no Actions then. They now expect both Microsoft Draft bindings and the exact action-to-Adapter matrix.
3. The Graph fixture was extended to persist and completely replace Draft state, preserve immutable ids, and record exact mutation methods and preference headers.

## Verification

Focused and compiled workflows:

- `bun test --path-ignore-patterns '__none__' microsoft/mailbox/draft-action.integration.test` — passed (16 tests, 52 assertions).
- `bun test apps/cli/src/e2e/_mock-graph.test.ts` — passed (3 tests, 15 assertions).
- `bun test packages/adapters/src/microsoft/mailbox/definition.test.ts packages/adapters/src/builtins.test.ts` — passed.
- `bun test --path-ignore-patterns '__none__' no-send.integration.test` — passed (4 tests, 27 assertions).
- `bun test --path-ignore-patterns '__none__' outlook-mailbox-workflow.e2e.test` — passed (68 assertions).

Static, architecture, and specification:

- `bun run typecheck` — passed.
- `bun run lint` — passed.
- `bash scripts/verify/network-egress.sh` — passed.
- `bun run scripts/verify/no-prompts-static.ts` — passed.
- `bun test scripts/verify/module-architecture.test.ts` — passed.
- `bun test --path-ignore-patterns '__none__' -- ./scripts/verify/multi-provider-architecture.red.ts` — expected future baseline: 1 pass (no send), 1 fail (Microsoft Calendar remains Slice 9).
- `openspec validate multi-provider-context-access --strict` — passed.
- `openspec validate --all --strict` — passed.
- `git diff --check` — passed.

Final project gate:

- `bun run ci` — passed all 12 gates in 107 seconds: install, lint, typecheck, build, package dependencies, architecture lint, CLI business-logic/framework/line gates, exports map, D3 compiled extension, and full test suite.
- Final full test suite: 913 passed, 0 failed.

## Independent review

- Standards/security review `4f12197d-a40f-4751-903c-1e9984ba7417`: approved with 0 critical and 0 important findings.
- OpenSpec/Graph API review `f4b2e021-442c-4f03-89f5-4ae84b6f1e59`: approved with 0 critical and 0 important findings and no unresolved API uncertainty.

## Remaining work

Slice 9 owns read-only Microsoft Calendar. The combined provider workflow, generated guidance hardening, and mandatory live Microsoft mail/calendar/Draft Human checkpoint remain later slices; no live traffic or mutation occurred in this automated gate.
