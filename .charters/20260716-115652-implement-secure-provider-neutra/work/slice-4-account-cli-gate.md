# Slice 4 — agent-first Auth and Account CLI gate

Date: 2026-07-16
Change: `multi-provider-context-access`
Scope: OpenSpec tasks 4.1–4.5

## Observed behavior

- `auth add <provider> --adapter <id>... (--loopback|--from-env)` accepts only the public client-id override and optional label. Literal client-secret, token, refresh-token, and authorization-code arguments are absent and malformed input fails before dependencies open.
- The authorization result reports the exact persisted Grant id, provider id, and normalized granted scopes.
- `account list [--json]` is a thin command over the core Account module. It deterministically nests Accounts, Grants, Realms, and Sources while excluding provider subjects, identity values, secret references, and token values.
- A compiled loopback workflow proves one stable Account across two Grants, ambiguity when an Account has multiple compatible Grants, explicit Grant selection, one Grant shared by two Sources, and safe nested inventory.
- Full Adapter description output derives provider URLs, provider and Adapter scopes, declared safe environment variable names, authorization hosts, and provider API hosts from loaded definitions. Active agent guidance uses that registry output rather than a hand-maintained Adapter vocabulary.

## Gate results

Passed:

- Focused auth/account parser, formatter, Account service, registry description, guidance, architecture, dependency, and compiled OAuth/Account workflow tests.
- Full ordinary unit suite with forced file-backed test Keychain: 739 passed, 0 failed, 2,342 assertions across 111 files.
- Full `bun run test:e2e`: 58 passed, 0 failed, 750 assertions across 20 files.
- `bun run typecheck`
- `bun run lint`
- `bun test scripts/verify/module-architecture.test.ts scripts/verify/package-dependencies.test.ts scripts/verify/agent-howtos.test.ts`
- `bun scripts/verify/package-dependencies.ts`
- `bash scripts/verify/network-egress.sh`
- `bun scripts/verify/no-prompts-static.ts`
- Explicit future-slice red contract: one no-send assertion passes and exactly two expected failures remain for provider modules and `calendar.event@1`.
- `openspec validate --all --strict`
- `git diff --check`
- Incremental cartography updated 225 tracked production/config files after affected codemaps were refreshed.

No live provider traffic, private environment values, or native Keychain entries were used. OAuth e2e traffic used isolated loopback mocks.

## Gate corrections

The first full unit attempt exposed `.env.example` drift after provider credential placeholders had been removed while the central environment schema still declared them. The placeholders were restored as commented infrastructure reference entries; workflow guidance remains registry-derived and forbids literal secret argv.

The explicit egress gate then exposed two stale static-audit declarations after loopback ownership moved into core and Google identity moved to OpenID Connect UserInfo. The audit now recognizes the core loopback-only redirect URI and allowlists the declared `openidconnect.googleapis.com` identity host; runtime fetches still pass through the fail-closed egress chokepoint.

## Independent review

- CLI/security/specification review `9ba298f0-2509-42b2-a9aa-8b060677a158`: approved with 0 critical and 0 important findings. It verified parse-before-deps behavior, safe deterministic fields, thin CLI ownership, the multi-Grant compiled workflow, registry-derived guidance, and task scope.
- Standards/correctness review `f379041b-af8b-4709-81cc-f23496d939f4`: approved with 0 critical and 0 important findings. It verified malformed-row tolerance, code-point ordering, control-character-safe text, lifecycle handling, compact/detail/full registry compatibility, and test maintainability.

## Remaining boundary

This gate does not claim Calendar vocabulary or provider Adapters. The next mandatory slice is the provider-neutral `calendar.event@1` Profile; Google Calendar and Microsoft provider behavior remain behind their later slice gates and Human checkpoints.
