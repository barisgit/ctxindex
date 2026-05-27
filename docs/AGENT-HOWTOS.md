# Agent how-tos for ctxindex

This page is for autonomous agents driving the real `ctxindex` CLI from a clean checkout. Run commands from the repo root unless a step says otherwise. Replace placeholder values such as `<path>` and `<query>` before running.

## Prerequisites

Install dependencies and verify that `bun link` exposes a working `ctxindex` binary:

```sh
bun install
bash scripts/verify/bun-link.sh
```

If the link verifier passes, a linked `ctxindex` command is available for the snippets below.

## Setup a fresh ctxindex home

Use sandboxed XDG/CTXINDEX paths in tests. For a normal local smoke, initialize once:

```sh
ctxindex init
```

## Index local files

Add a local directory source to the global realm, run sync, search, and inspect status:

```sh
ctxindex source add local.directory --realm global --root <path>
ctxindex sync
ctxindex search 'query'
ctxindex status
```

Use `--json` on commands that support it when another program will parse output.

## Bundled skills

List available skills, read the getting-started skill, and optionally inline referenced files:

```sh
ctxindex skills list
ctxindex skills get getting-started
ctxindex skills get getting-started --inline
```

## Secrets migration

Choose the destination backend explicitly; `keychain|file` in specs means one of these concrete commands:

```sh
ctxindex secrets migrate keychain
ctxindex secrets migrate file
```

For the encrypted file backend, set `CTXINDEX_SECRETS_PASSPHRASE` or pass the required flag before migrating.

## OAuth in autonomous CI with mocks

Mocked Gmail acceptance is defined in `apps/cli/src/e2e/gmail-autonomous.e2e.test.ts`. That test starts a local OAuth/Gmail mock and drives the CLI with these env vars:

- `CTXINDEX_GMAIL_MOCK_BASE_URL`
- `CTXINDEX_GMAIL_CLIENT_ID`
- `CTXINDEX_GMAIL_CLIENT_SECRET`
- `CTXINDEX_GMAIL_REFRESH_TOKEN`

A CI-style mocked auth/source/sync flow looks like:

```sh
export CTXINDEX_GMAIL_MOCK_BASE_URL=http://127.0.0.1:<port>
export CTXINDEX_GMAIL_CLIENT_ID=gmail-client-id
export CTXINDEX_GMAIL_CLIENT_SECRET=gmail-client-secret
export CTXINDEX_GMAIL_REFRESH_TOKEN=gmail-refresh-token
ctxindex auth add google --from-env
ctxindex source add google.mailbox --realm global
ctxindex sync
```

Do not use real network credentials for the mocked lane; rely on the e2e test harness to supply the local mock base URL.

## OAuth with real loopback authorization

For real Gmail, create a Google Cloud OAuth client with a loopback redirect URI allowed for `http://127.0.0.1:<random>/callback`, then run the loopback flow. The CLI binds a random local port, opens the browser, captures the callback code, exchanges it, and stores tokens in the configured secret backend.

```sh
export CTXINDEX_GMAIL_CLIENT_ID=<google-oauth-client-id>
export CTXINDEX_GMAIL_CLIENT_SECRET=<google-oauth-client-secret>
ctxindex auth add google --client-id "$CTXINDEX_GMAIL_CLIENT_ID" --client-secret "$CTXINDEX_GMAIL_CLIENT_SECRET" --loopback
ctxindex source add google.mailbox --realm global
ctxindex sync
```

For autonomous live e2e runs, also set `CTXINDEX_GMAIL_REFRESH_TOKEN` so the test can exchange a refresh token without operator handoff:

```sh
export CTXINDEX_GMAIL_REFRESH_TOKEN=<refresh-token-for-test-mailbox>
bun run test:e2e
```

If the machine has no browser, set `CTXINDEX_NO_BROWSER=1` to print the auth URL and complete the callback manually within `CTXINDEX_LOOPBACK_TIMEOUT_SECS` seconds.

## Verifying changes

Run the narrow check first when editing this guide, then the normal repo checks:

```sh
bun test packages/core/src/meta/agent-howtos.test.ts
bun run typecheck
bun run lint
bun test
bun run test:e2e
bash scripts/verify/ci.sh
```

## Exit code reference

| Code | Meaning | Typical agent action |
| ---: | --- | --- |
| 0 | Success | Continue to the next step. |
| 2 | Invalid usage or missing required input | Fix flags, env, or referenced entities and retry. |
| 10 | Needs authentication, such as revoked Gmail token | Re-run `ctxindex auth add google` or refresh credentials. |
| 20 | Rate limited or transient provider condition | Back off and retry later. |
| 30 | Network or provider failure/conflict | Check connectivity, provider mock, or remote service state. |
| 40 | Permission denied or inaccessible local path/secret | Fix filesystem, keychain, or provider permissions. |
| 50 | Timeout or terminal sync/OAuth failure; loopback OAuth timeout lands here | Inspect stderr/logs and rerun with corrected OAuth or sync inputs. |
| 124 | Wall-clock timeout from `scripts/with-timeout.ts` | Treat as a hung command; inspect child process logs. |
| 130 | Cancelled by SIGINT | Stop or rerun intentionally. |
