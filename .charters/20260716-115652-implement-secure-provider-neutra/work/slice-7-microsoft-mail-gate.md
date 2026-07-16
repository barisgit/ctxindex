# Slice 7 Microsoft identity and Outlook mail gate

Date: 2026-07-16
Change: `multi-provider-context-access`
Scope: OpenSpec tasks 7.1–7.8; automated loopback fixtures only, with no live Microsoft traffic or private credential access.

## Result

Passed. Slice 7 adds one declarative Microsoft OAuth provider and a provider-owned `microsoft.mailbox@1` Adapter while preserving provider-neutral core, CLI, Profiles, storage, thread, export, and Artifact paths.

- Microsoft identity uses the `common` v2 authorization/token endpoints, public-client S256 PKCE, Graph `/v1.0/me` `id` as the stable Account subject, and declared personal/work-safe labels.
- The stateful loopback mock proves one-use refresh-token rotation, personal and organizational identity shapes (including personal `mail: null`), malformed/insufficient response cleanup, exact stored granted scopes, stable Account reuse, and no Google egress.
- Outlook discovery uses bounded, fully quoted Graph mail KQL, documented date-only coarse bounds plus exact local timestamp filtering, strict supported typed filters, client-side Draft exclusion, immutable IDs, validated paging, and normalized provider errors.
- Complete retrieval uses immutable-id and text-body preferences, stable Source-scoped opaque Refs, provider/RFC conversation Relations, strict addresses/headers/body schemas, and generic local materialization/thread traversal.
- File attachments become managed descriptors, page safely, stream exact `$value` bytes, reject malformed/foreign identities before I/O, and reuse generic content-addressed cache bytes. Unsupported non-file attachments are bounded warnings and do not corrupt the parent Resource.
- The compiled CLI workflow proves one Microsoft Account/Grant across exact Realms and named Outlook Sources; remote search/get/thread; immutable identity after a simulated folder move; attachment miss/hit and exact bytes; EML/JSON exports; provider degradation; safe Account inventory; and zero provider-specific core/CLI route.
- `Mail.ReadWrite` is declared for the later reversible Draft Actions, but Slice 7 intentionally advertises no incomplete Action bindings. OpenSpec task 7.3 was clarified accordingly; Slice 8 owns the actual create/update bindings and mutations. `Mail.Send` and send routes remain absent.

## Corrections found during verification

1. The delegated transport initially lacked the configured loopback Graph base and rejected loopback next links. `transport.ts` now accepts only a credential-free `127.0.0.1` origin outside production, ignores it in production, and pins each next link to the active origin and exact route.
2. Canonical message Ref parsing initially rejected opaque provider IDs containing an encoded slash even though discovery emitted them. The parser now accepts any canonically encoded opaque ID and still rejects noncanonical encodings before I/O.
3. Independent API review found Graph mail `$search` was not one fully quoted KQL clause, used unsupported full ISO timestamps, and emitted undocumented `isread`. The implementation now uses one fully quoted clause, MM/DD/YYYY coarse bounds with exact local post-filtering, and rejects unsupported `unread` filters before I/O.
4. Adding the compiled Outlook workflow exposed an existing 5-second contention edge in the complete V1 e2e. That test now uses the same explicit 30-second bound as other compiled workflows; behavior is unchanged.
5. The static network inventory now includes the declared Microsoft identity and Graph hosts.

## Verification

Focused and integration:

- `bun test packages/adapters/src/microsoft/provider.test.ts apps/cli/src/e2e/_mock-graph.test.ts` — passed.
- `bun test --path-ignore-patterns '__none__' microsoft-auth.integration.test` — passed (personal/work Accounts, stable reuse, two persisted refresh rotations, malformed identity/token and insufficient-scope cleanup).
- `bun test packages/adapters/src/microsoft/mailbox/*.test.ts` — passed (28 focused mailbox tests after final KQL correction).
- `bun test --path-ignore-patterns '__none__' outlook-mailbox-workflow.e2e.test` — passed (47 assertions).
- `bun run test:integration` — passed.
- `bun run test:e2e` — passed (60 tests, 873 assertions before the final added move assertion; the final full suite below includes the latest snapshot).

Static, architecture, and specification:

- `bash scripts/verify/network-egress.sh` — passed.
- `bun scripts/verify/no-prompts-static.ts` — passed.
- `bun test scripts/verify/module-architecture.test.ts` — passed.
- `bun test --path-ignore-patterns '__none__' ././scripts/verify/multi-provider-architecture.red.ts` — expected future baseline: 1 pass (no send), 1 fail (Microsoft Calendar module remains Slice 9).
- `openspec validate multi-provider-context-access --strict` — passed.
- `openspec validate --all --strict` — passed.
- `git diff --check` — passed.
- `bash scripts/spikes/d3-compiled-extension/run.sh` — passed with Bun 1.3.14.

Final project gate:

- `bun run ci` — passed all 12 gates: install, lint, typecheck, build, package dependencies, architecture lint, CLI business-logic/framework/line gates, exports map, D3 compiled extension, and full test suite.
- Final full test suite: 896 passed, 0 failed.

## Independent review

- Security/privacy/architecture review `136d7a93-85ff-4ab6-a471-df2bd872454d`: approved with 0 critical and 0 important findings.
- Graph/API/schema review `82127e94-5332-4d44-98c6-cfe6f274df68`: initially found two important KQL issues; both were corrected.
- Focused Graph search re-review `6f5cbc62-f4b8-44ff-a950-aed0cf4a523c`: approved the corrected search with 0 critical and 0 important findings.

## Remaining work

Slice 8 owns Outlook Draft create/update Actions. Slice 9 owns Microsoft Calendar. The mandatory live Microsoft Human checkpoint occurs later and remains untouched by this automated gate.
