## 1. Contracts and storage foundation

- [x] 1.1 Add client-record storage: metadata table (provider, label, client-id ref, optional secret ref, timestamps) with per-provider label uniqueness, plus typed secrets-backend persistence reusing the Grant write/cleanup pattern
- [x] 1.2 Add account label uniqueness (global) and label-rename-on-upsert semantics to the Account service; keep `(provider, external_user_id)` deduplication
- [x] 1.3 Add Source label defaulting (`<account-label>-<adapter-tail>` / `<adapter-tail>`), global uniqueness, and hard collision errors to the Source service
- [x] 1.4 Slice gate: focused unit tests for client persistence/cleanup, label defaults, uniqueness scopes, and collision errors pass

## 2. Core authorization rework

- [x] 2.1 Add a client-resolution module: resolve one provider-matched persisted client (single → silent, none → actionable error, several → require label); remove runtime env-var client resolution
- [x] 2.2 Rework `authorizeProvider`: derive scopes from provider base scopes plus the sorted union of ALL loaded Adapters declaring the provider; delete per-command Adapter selection; keep token scope validation, loopback/from-env token acquisition, identity resolution, and Grant persistence with the authorizing client's refs
- [x] 2.3 Implement Account removal: delete Account, Grants, and secret references; verify bound Sources surface `needs_auth` through existing status machinery
- [x] 2.4 Slice gate: core auth unit/integration tests pass, including union derivation, client resolution branches, re-consent upsert, and removal cleanup

## 3. CLI surface

- [x] 3.1 Delete the `auth` command (`apps/cli/src/auth/`, `apps/cli/src/args/auth.ts`, command registration) with no aliases
- [x] 3.2 Add `client add <provider> [--label] --from-env`, `client list`, `client remove <provider> <label>` with provider validation against loaded OAuth specs and stable exit codes
- [x] 3.3 Add `account add <provider> [--label] [--client <label>]` and `account remove <label>`; extend `account list` with the local label
- [x] 3.4 Extend `--account` resolution (label → account id → grant id, provider-scoped) and accept Source labels wherever Source ids are accepted; update `resolveSourceGrant`
- [x] 3.5 Slice gate: CLI e2e tests cover the full `client add` → `account add` → `source add` → sync flow with mocked providers, label collisions, ambiguous/missing client errors, and provider-mismatch impossibility

## 4. Generated interfaces and documentation

- [x] 4.1 Regenerate `describe`, help, bundled skills, and workflow guidance from registries; remove `auth` vocabulary
- [x] 4.2 Update `.env.example`, `docs/AGENT-HOWTOS.md`, and affected codemaps for the client/account flow and add-time-only `--from-env`
- [x] 4.3 Slice gate: generated-interface drift checks and documentation lint pass

## 5. Final verification

- [x] 5.1 Rework egress, black-box, and D3 external-Extension suites to the new vocabulary; confirm no-send and host-allowlist gates stay green
- [x] 5.2 Run the full project gate: typecheck, lint, unit, integration, e2e, architecture/dependency checks, drift/cartography
- [x] 5.3 Run `openspec-verify-change` on the completed change
