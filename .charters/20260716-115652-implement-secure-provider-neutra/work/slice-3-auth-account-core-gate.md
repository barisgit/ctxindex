# Slice 3 — provider-neutral OAuth, Accounts, and Grants gate

Date: 2026-07-16
Change: `multi-provider-context-access`
Scope: OpenSpec tasks 3.1–3.7

## Observed behavior

- Loaded Adapter definitions declare one validated OAuth provider contract, selected Adapter operation scopes, and bounded per-Adapter provider API hosts.
- Scope selection rejects empty, duplicate, unknown, ambiguous-version, non-OAuth, and mixed-provider selections before authorization. Only provider base scopes plus explicitly selected Adapter scopes are requested, in Unicode code-point order.
- Provider identity uses the declared stable subject path. Verified identity paths populate Account Identities, and repeated authorization of one `(provider, external_user_id)` reuses one Account while retaining separate Grants.
- Grant persistence writes typed Vault references first, commits Account and Grant rows transactionally, and deletes temporary refs on failure. Refresh writes replacement access/refresh refs before updating the Grant, then cleans old refs best-effort.
- Core owns provider-neutral token, identity, scope, S256 PKCE, loopback callback/state/timeout, browser activation, and no-browser URL emission. There is no out-of-band code or literal secret/token CLI input.
- Source access uses only its linked compatible Grant. Undeclared or insecure API URLs fail before token resolution or fetch; declared hosts reach the default global egress chokepoint; redirects are manual. Reads retain exactly one 401 refresh retry and Actions retain zero automatic retries.
- Source Grant selection accepts safe local Account or Grant ids, never the hidden external provider subject.

## Gate results

Passed:

- `bun test packages/core/src/auth packages/core/src/account packages/core/src/storage/migrator.test.ts packages/core/src/secrets/backend-manager.test.ts`
- `bun test packages/extension-sdk/src packages/core/src/registry packages/adapters/src/builtins.test.ts`
- `bun test packages/core/src/source packages/core/src/action/run.test.ts packages/core/src/net apps/cli/src/source/resolve-source-grant.test.ts`
- Full `bun run test:e2e`: 57 passed, 0 failed, 708 assertions across 19 files.
- Full ordinary unit suite with forced file-backed test Keychain: 725 passed, 0 failed, 2,312 assertions across 108 files.
- Final `bun run ci`: all gates passed, including full-test-suite 796 passed / 0 failed.
- `bun run build`
- `bun run typecheck`
- `bun run lint`
- `bun run scripts/verify/package-dependencies.ts`
- `bun test scripts/verify/module-architecture.test.ts`
- Explicit future-slice red contract: 3 passed / exactly 2 expected failures remain (Google Calendar/Microsoft Adapter ownership and `calendar.event@1` Profile); provider-neutral core/CLI and no-send assertions pass.
- `openspec validate multi-provider-context-access --strict`
- `openspec validate --all --strict`
- `git diff --check`

No live provider traffic, private environment values, or native Keychain entries were used. OAuth e2e traffic used only isolated loopback mocks; unit runs forced the file-backed Keychain mock.

## Gate corrections

The first broad source gate exposed test fixtures that had not yet declared their fake provider hosts. Parent review then found a more important production-path gap hidden by injected-fetch tests: default Source requests called the global egress wrapper without the Adapter host list. The final implementation passes `providerApiHosts` into the chokepoint and includes a direct default-fetch regression test. It also rejects insecure schemes/URL credentials and forces manual redirects.

The first full unit run found one architecture-lint fixture still naming the deleted Google scope test. The fixture and obsolete Google loopback architecture exceptions were removed; the settled full unit run is the 725/0 result above.

## Independent review

- Standards/correctness review `fa771e41-5811-4fa1-9b32-18c355c8cac3`: approved with 0 critical and 0 important findings across OAuth, PKCE/loopback, token rotation, cleanup, Account SQL/transactions, identity parsing, scope handling, host checks, and API compatibility.
- Specification/security review `98a2b4ec-7018-460a-a984-1d7e5b802f43`: approved implementation with 0 critical and one process finding: the auth half of Slice 4 parser/command work was pulled forward while replacing the removed Google-only runtime. No further Slice 4 work proceeded before this Slice 3 gate. `account list` and the remaining combined Slice 4 contracts stay unchecked and will receive their own mandatory gate.
- Final task 3.6 host/Source delta review `e00193eb-7bec-451d-8d7a-152482cbce6e`: initially found one stale e2e email selector after the deliberate removal of external-subject selection. The fixture now selects local Account id `account-grant-b`; the reviewer re-ran the focused Source e2e and approved with 0 critical and 0 important findings. The settled full e2e result is 57/57.

## Remaining boundary

This gate does not claim the Slice 4 Account CLI. `account list [--json]`, combined parser/handler contracts, generated provider guidance, multi-Grant compiled workflow, and the Slice 4 independent gate remain next. Calendar and Microsoft provider modules remain deferred to their dependency-ordered slices.
