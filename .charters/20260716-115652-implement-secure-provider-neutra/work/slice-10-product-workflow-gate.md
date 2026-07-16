# Slice 10 automated product workflow gate

Date: 2026-07-16
Scope: OpenSpec tasks 10.1–10.3. The separate Microsoft Human checkpoint in task 10.4 is not covered here.

## Result

Passed. A relocated compiled executable completed the six-Source, three-Account workflow from isolated state, and the recursive security/interface gates passed with no critical or important review findings.

## Product workflow

- The compiled binary was copied to a separate directory, its build origin removed, and every command ran from `/` with isolated config/data/state/cache paths.
- Three stable Accounts and exact Grants were created: two distinct Google identities and one Microsoft identity. Personal Gmail and Google Calendar share one Grant; work Gmail owns a second Google Grant; Outlook and Microsoft Calendar share one Microsoft Grant. A local directory Source has no fabricated Account or Grant.
- Six named Sources span explicit personal, work, and files Realms. Account and Source listings are byte-stable on repeat and omit subject/token/client-secret canaries.
- Unscoped remote/indexed searches span Accounts; exact personal, work, and files Realm searches exclude other Realms. Mail, Calendar event, and file `get`; Gmail and Outlook threads; cached attachment download; and JSON/EML exports pass through generic commands.
- Gmail and Outlook each perform exactly one Draft create and one complete update with stable Ref reuse. Invalid input and an unknown send-like Action perform zero provider mutation. Recorded provider routes contain no send operation; Calendar traffic is GET-only; stored scopes omit send and Calendar write permissions.
- Gmail API mocks reject unknown bearer tokens. Safe credential labels prove both Google Accounts' tokens are exercised and the Gmail Draft mutations use the personal Source's Grant without retaining raw authorization values.

Focused relocated workflow: 1 pass, 153 assertions. Google mock identity/authorization test: 1 pass, 3 assertions.

## Global security and interface gates

- `scripts/verify/network-egress.sh` recursively discovers all production Adapter `context.fetch` callers and requires co-located tests; fixes the approved Google/Microsoft host set and test-only mock ownership; rejects raw/alternate fetch clients; and runs provider-context, redaction, no-send, malformed-command, and egress tests.
- Seeded temporary `globalThis.fetch` and `Mail.Send` production violations were each rejected before removal.
- Malformed account/auth/source/action/sync commands exit 2 with empty stdout, no mock request, no config/data/cache/state creation, and no canary disclosure.
- Registry describe coverage includes Microsoft mailbox/calendar OAuth, exact scopes, API hosts, capabilities, and generated config flags. Bundled guidance remains registry-derived and the CLI overview is checked against every root command. Packaging notes describe the pinned compiled/relocated executable and external Extension boundary.

## Final settled verification

- `bun run ci`: all 12 gates passed, including frozen install, lint, typecheck, build, dependency/architecture/CLI/export gates, D3, and `full-test-suite: PASS (944 pass / 0 fail)`; elapsed 126s.
- `bash scripts/verify/network-egress.sh`: passed its static/discovery audits and 61 focused runtime tests.
- `bun run test:integration`: passed.
- `bun run test:e2e`: passed.
- `openspec validate multi-provider-context-access --strict`: passed.
- `openspec validate --all --strict`: passed.
- `git diff --check`: passed.

An initial CI invocation immediately after the bearer-isolation hardening stopped at the full-suite gate; the isolated full suite then passed 944/0 and the settled complete CI rerun passed all gates. No failing behavior reproduced on the settled snapshot.

## Independent review

- Security review `99308a91-aa72-413b-91b8-704ff24a2cc4`: approved with 0 critical and 0 important findings.
- Workflow review `adf9794b-a781-4ebf-84e1-8aa8574dd365`: initially found a broken guidance sentence and insufficient per-Account bearer validation. Both were fixed; resumed review approved with 0 remaining critical or important findings.

## Boundary

No live provider traffic, browser login, native secret value, or private credential was accessed. Task 10.4 must prepare isolated Microsoft state and pause before app registration/login/consent, before Draft mutation, and for final UI confirmation.
