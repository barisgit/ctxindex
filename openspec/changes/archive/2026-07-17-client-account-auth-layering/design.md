## Context

V1.1 shipped `auth add <provider> --adapter <id>... (--loopback|--from-env)`: one command that resolves the OAuth client from environment variables, requests consent for the explicitly selected Adapters' scope union, discovers the Account as a side effect, and persists a Grant. The domain model underneath is already layered correctly — `accounts` deduplicate on `(provider, external_user_id)` with a label column, `grants` store per-grant `client_id_ref`/`client_secret_ref`, `sources` bind explicit compatible Grants — but the CLI surface exposes Grant/scope machinery that users cannot predict. Exploration (this change's origin) settled a four-layer model — client → account → grant (internal) → source — with grants invisible in the happy path. The repository is pre-alpha: `auth` is deleted outright, no aliases or migration.

## Goals / Non-Goals

**Goals:**
- Three-noun CLI mental model: `client` (once per provider), `account` (once per identity), `source` (per stream). Grants stay internal.
- Consent covers everything installed: `account add` requests provider base scopes plus the sorted union of all loaded Adapters declaring that provider.
- Labels as handles: verbatim defaults, hard collision errors, no normalization, no namespace syntax.
- Provider mismatch impossible by construction, with `client add` validating the provider against loaded declarative OAuth specs (closing the one identified gap).
- Persisted client records replace runtime env-var client resolution.

**Non-Goals:**
- Managed/hosted ctxindex OAuth clients (future direction; users still create their own console/Entra apps).
- Multiple-client-per-provider workflows beyond label support (representable, not optimized).
- Least-privilege per-adapter consent as the default (available implicitly by loading fewer Extensions; no `--adapter` flag returns).
- Any change to Source/Realm semantics, sync, search, retrieval, Actions, or the no-send boundary.
- Migration of existing prototype Grants or CLI compatibility aliases.

## Decisions

- **D1 Delete `auth`, add `client` + reworked `account`.** Alternative (nesting `client`/`account` under `auth`) rejected: three-level commands for the most common onboarding step, and the CLI surface is already near its complexity budget.
- **D2 Consent = all loaded Adapters for the provider.** Alternative (declare Sources first, authorize last with the exact union) was architecturally cleaner but UX-unpredictable; over-permissioning is explicitly accepted for a local personal tool. Re-running `account add` after loading new Extensions re-consents with the enlarged union — no separate refresh verb.
- **D3 Client records persist in the secrets backend with metadata rows.** Client id/secret are written through the configured secrets backend (same typed-ref discipline as Grant secrets); a metadata table stores `(provider, label, refs, timestamps)`. `--from-env` reads the provider's declared environment names once at add time. Runtime resolution never consults the environment. Alternative (keep env-var resolution, add labels on top) rejected: two sources of truth.
- **D4 Label defaults are verbatim; collisions are exit-2 errors.** client → provider id; account → verified provider identity (upsert makes same-identity collisions impossible); source → `<account-label>-<adapter-tail>` (`<adapter-tail>` when the Adapter needs no account). No slugification (`blaz@paxia.co-mailbox` is acceptable, predictable, and self-heals when users label accounts). Never auto-suffix, never prompt.
- **D5 Uniqueness scoping follows the reference context.** Client labels unique per provider and every client reference carries the provider explicitly — including `client remove <provider> <label>`; account and source labels unique globally (referenced bare by `--account`/`--source`). No `provider:label` namespace syntax.
- **D6 Provider correctness by construction.** Positional args fix the provider at every layer; `--client` resolves only among that provider's clients; `--account` on `source add` resolves only among Accounts matching the Adapter's declared provider. `client add` rejects provider ids absent from the loaded registry's OAuth provider specs.
- **D7 `--client` auto-resolution.** Exactly one client for the provider → used silently; zero → error directing to `client add`; multiple → error listing labels. Grants keep recording the authorizing client's refs so refresh uses the correct client.
- **D8 Reference resolution order for `--account`:** account label, then account id, then grant id — exact matches only, ambiguity impossible given global label uniqueness and ULID id shapes.
- **D9 `account remove <label>`** deletes the Account, its Grants, and their secret references; Sources bound to removed Grants surface `needs_auth` through existing status machinery. Alternative (block removal while Sources reference it) rejected as unnecessary friction pre-alpha; the failure mode is explicit and recoverable. Removing and re-adding an Account creates a fresh Grant id; previously bound Sources stay `needs_auth` until recreated.
- **D10 One stable Grant per Account.** `account add` upserts a single Grant per Account: the first authorization creates it, re-authorization updates scopes and token/secret references in place under the same grant id. This keeps Source `grant_id` bindings valid across re-consent and makes multiple-compatible-Grant ambiguity structurally impossible in the happy path. Alternative (a new Grant per authorization, as V1.1 did) rejected: it leaks Grant-selection errors into `source add` after every re-consent.

- **D11 Source label subsumes display name.** Sources carry one required unique `label` column replacing the optional `display_name`; `--name` disappears with the rest of the old vocabulary. Alternative (separate label + display name) rejected: two naming fields for one entity.
- **D12 Post-flow label conflict detection.** Explicit and cross-provider default account-label collisions are detectable only after identity resolution, so `account add` validates the final label inside the persistence transaction and fails with cleaned secrets on conflict with a different Account. Cross-provider identical emails therefore require `--label` — accepted as rare and explicit.
- **D13 `account remove` clears Source bindings.** Bound Sources' `grant_id` is set NULL in the same transaction that deletes Grants (FK-safe); OAuth-adapter Sources without a Grant deterministically fail sync/provider I/O as `needs_auth`.

## Risks / Trade-offs

- [Over-permissioning by default] → Accepted deliberately; loading fewer Extensions narrows consent, and evidence/scope reporting in `account list` keeps granted scopes visible.
- [Env-var removal breaks existing harness scripts and e2e fixtures] → Reworked in the same change; `.env.example`, docs, and generated skills regenerate from registries.
- [Verbatim email-derived source labels are ugly] → Accepted; `--label` on `account add` is the intended steady state and the composed default self-heals.
- [Deleting `auth` invalidates bundled skills/docs/black-box suites wholesale] → They are registry-derived or test-owned; regeneration is part of the task list, and pre-alpha status removes compatibility obligations.
- [Secrets-backend writes for clients add a new cleanup path] → Reuse the Grant persistence pattern: write refs, then metadata transactionally, cleaning refs on failure.

## Migration Plan

None. Pre-alpha: prototype databases and CLI vocabulary are disposable. Fresh state is created through `client add` + `account add`; no data migration, aliases, or deprecation warnings.

## Open Questions

- None blocking. The exact non-`--from-env` credential input form for `client add` (e.g. reading from stdin vs. declared env only) is settled at spec level as: environment-based input only in this change, matching the existing no-argv-secrets rule.
