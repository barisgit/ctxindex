# Slice 2 — explicit secret backend gate

Date: 2026-07-16
Change: `multi-provider-context-access`
Tasks: 2.1–2.7

## Result

Passed. Secret reads now route by typed backend references, writes use only the configured backend, fresh initialization persists an explicitly probed backend, and backend changes are copy-first, transactionally referenced, config-last, cleanup-after-commit, and retryable. The CLI exposes only `secrets status [--json]` and `secrets backend set <keychain|file>`; legacy/passphrase/value-bearing arguments fail before dependencies open.

## Security properties verified

- File refs retain encoded provider scope and cannot collide across providers.
- Keychain failure never falls back to encrypted-file writes.
- File envelopes record key mode, preserve it across later environment changes, use XChaCha20-Poly1305, and use separate HKDF-derived key-check and ciphertext-MAC keys.
- `secret.key` and encrypted files are private; fresh file initialization creates the key without writing a placeholder secret box.
- Status probes availability and counts typed database references without listing/decrypting secret records or rendering keys/values.
- Backend switching covers target-copy, SQLite transaction, config-commit, cleanup, interruption, retry, mixed-reference, and idempotence windows.
- CLI/e2e canaries never appear in stdout/stderr, and invalid literal-secret options create no config or database.
- Automated tests cannot access the native macOS Keychain: sandboxes and the full suite force file-backed mocks, the relocated compiled Extension e2e supplies its own mock, and non-live `NODE_ENV=test` native access is rejected.

## Verification

- Focused core secrets/config + CLI parser/formatter/init/backend e2e: passed.
- Real CLI backend lifecycle: file → mock Keychain → file, exact auth-ref/value continuity, unavailable-target rollback, Extension-free status: passed.
- Relocated compiled Extension e2e with isolated Keychain mock: passed.
- Exit-code regression after removal of `secrets migrate`: passed.
- Expected red architecture contract: 1 pass / 5 expected future-slice failures (down from the Slice 1 baseline of 1 pass / 6 failures).
- Full test suite: 776 pass / 0 fail.
- Network egress verification: passed.
- D3 compiled Extension spike: passed.
- Package dependency, architecture lint, module architecture, no-prompts static checks: passed.
- Typecheck: passed.
- Biome lint: passed.
- `openspec validate multi-provider-context-access --strict`: passed.
- `openspec validate --all --strict`: passed.
- `git diff --check`: passed.
- Cartography incremental update: clean over 212 tracked production/config files.

## Independent review

Review run `8e03db4b-3f22-4a93-96a8-3cd8c63dd308` approved the initial implementation and the final security delta with 0 critical and 0 important findings. The final review specifically confirmed no-value-open status, stable envelope key mode, corrupt-ciphertext probe failure, native-Keychain test guards, and backend movement continuity.

Non-blocking observations were either resolved (misleading cleanup status, shared AEAD/HMAC key) or retained consciously: availability probes are side-effectful by design (a bounded synthetic Keychain write/read/delete or creation of missing private file key material), and an atomic config commit still rewrites the command-open snapshot in this single-user pre-alpha CLI.

## Gate incidents corrected

A broad test initially reached the user's native Keychain through the relocated compiled tenders e2e's hand-built environment. It only used a synthetic probe value, but this was unacceptable. The test now injects an isolated mock and two defense layers prevent recurrence. A stale exit-code fixture also invoked removed `secrets migrate` syntax and was updated to use valid `secrets status --json` for malformed-config exit 40 coverage.

No live provider traffic ran.
