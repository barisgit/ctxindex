## 1. Keychain inventory consistency

- [x] 1.1 Add a deterministic failing mocked-keytar reproduction proving concurrent successful writes across backend instances currently lose an inventory entry.
- [x] 1.2 Serialize Keychain inventory-bearing operations process-wide and make set/delete ordering failure-aware without changing `SecretsStore` or typed refs.
- [x] 1.3 Add failure-ordering coverage for inventory publication, credential persistence, compensation, and retryable deletion; run focused Keychain tests, core typecheck, lint, and secret redaction/architecture gates.
- [x] 1.4 Add failing probe read/delete cleanup coverage and use one stable probe identity whose cleanup is always attempted and retryable.
- [x] 1.5 Keep the probe service structurally outside normal scoped-secret services and add a collision regression.
- [x] 1.6 Specify and cover the double-failure path where credential write and inventory compensation both report failure.

## 2. Authentication cleanup visibility

- [x] 2.1 Add failing reauthorization and refresh tests proving superseded-secret deletion failures are currently silent.
- [x] 2.2 Count cleanup failures and emit one bounded redacted warning while preserving original pre-commit failures and committed post-swap results.
- [x] 2.3 Run focused Grant/auth/refresh tests and stable exit/redaction checks.
- [x] 2.4 Add deterministic failing concurrent reauthorization and refresh coverage proving losing fresh refs can be stranded.
- [x] 2.5 Serialize authorization, refresh, and removal per exact Account identity and re-read Grant state inside the critical section.
- [x] 2.6 Revalidate the requested Account label after queued work and cover a deterministic rename/removal race.
- [x] 2.7 Restrict cleanup warning bindings to Provider id, Grant id, lifecycle phase, and failed-entry count, with Account id and sensitive fields excluded.

## 3. Doctrine and final verification

- [x] 3.1 Promote behavior into the canonical secret-backend and Account/Grant specs, promote applicable doctrine into both canonical implementation sidecars, refresh `SYSTEM.md`, and update affected codemaps through cartography.
- [x] 3.2 Run focused package and e2e checks, `bun run ci`, `bunx openspec validate --all --strict`, `git diff --check`, cartography verification, and `openspec-verify-change`; obtain independent review before reporting completion.
