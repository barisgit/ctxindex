# Final fresh-context black-box QA

Date: 2026-07-16
Operator: `5a3673ca-ac3b-4ff1-81d0-f6ea36006f62`
Verdict: pass

The fresh operator worked from the product boundary, used only the repository's loopback provider mocks, did not read ignored checkpoints or `.env`, did not access native Keychain, and made no live provider request. Every command passed on its first run; no retry or flake classification was needed. Runtime was Bun 1.3.14.

Each E2E file used this documented invocation shape from the repository root:

```sh
bun run scripts/with-timeout.ts 300 -- bun test --path-ignore-patterns '__none__' --pass-with-no-tests <test-file>
```

| Runtime surface | Test file | Result |
|---|---|---|
| Secret status and backend switching | `apps/cli/src/e2e/secrets-backend.e2e.test.ts` | exit 0; 2 passed |
| Safe Account inventory | `apps/cli/src/e2e/account.e2e.test.ts` | exit 0; 1 passed |
| Selected-scope loopback authorization mock | `apps/cli/src/e2e/oauth-loopback.e2e.test.ts` | exit 0; 1 passed |
| Selected-scope headless authorization mock | `apps/cli/src/e2e/oauth-headless.e2e.test.ts` | exit 0; 1 passed |
| Relocated multi-Account/multi-Realm compiled workflow | `apps/cli/src/e2e/relocated-multi-realm-workflow.e2e.test.ts` | exit 0; 1 passed |
| Google Calendar workflow | `apps/cli/src/e2e/google-calendar-workflow.e2e.test.ts` | exit 0; 1 passed |
| Google and Microsoft Calendar workflow | `apps/cli/src/e2e/multi-provider-calendar-workflow.e2e.test.ts` | exit 0; 1 passed |
| Outlook read/thread/attachment/export/Draft workflow | `apps/cli/src/e2e/outlook-mailbox-workflow.e2e.test.ts` | exit 0; 1 passed |
| Stable exit taxonomy | `apps/cli/src/e2e/exit-codes.e2e.test.ts` | exit 0; 6 passed |
| Malformed command zero side effects | `apps/cli/src/e2e/malformed-zero-side-effects.e2e.test.ts` | exit 0; 1 passed |

The operator then ran:

```sh
bash scripts/spikes/d3-compiled-extension/run.sh
bun --version
```

Both exited 0; the relocated D3 compiled Extension spike reported pass and `bun --version` returned `1.3.14`.

No failure, suspected flake, skipped requested surface, secret output, send behavior, or Calendar write behavior was observed.
