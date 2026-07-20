# packages/core/src/secrets/

## Responsibility

Provides typed opaque secret references, encrypted-file and OS-Keychain backends, no-fallback runtime routing, fresh-install selection, and crash-safe switching of local OAuth App config plus Grant snapshot/token references.

## Design/patterns

- `SecretsStore` in `types.ts` is the storage strategy interface; `FileBackend` and `KeychainBackend` emit and validate backend-qualified refs via `fileRef()`/`keychainRef()`.
- `SecretVault` is the routing facade: reads/deletes follow `parseSecretRef(ref).backend`, writes go only to the configured backend, and backend unavailability is surfaced rather than silently falling back.
- `FileBackend` uses a versioned XChaCha20-Poly1305 envelope with separate HKDF-derived key-material and ciphertext-integrity checks, PBKDF2-SHA256 passphrase derivation or a private 32-byte `secret.key`, deterministic scoped keys, atomic replacement, and mode-`0600`/directory-`0700` permissions.
- `KeychainBackend` adapts `keytar`, maintains a reserved index for listing, serializes inventory-bearing operations process-wide across instances, performs a write/read/delete availability probe through one stable retryable credential in a service outside the normal scoped-secret namespace, and refuses native Keychain access in non-live tests unless `CTXINDEX_KEYTAR_MOCK_FILE` is configured.
- `SecretBackendManager` is a resumable copy-and-switch coordinator; `initializeSecretBackend()` separately owns one-time backend selection for a missing config.

## Data & control flow

1. Callers create/parse opaque refs with helpers in `types.ts`; `SecretVault` routes typed reads/deletes to their exact backend and configured writes to one backend only.
2. File reads derive the envelope-recorded key mode and decrypt `secrets.box`; writes preserve that mode, encrypt all scoped records with a fresh nonce, and atomically replace the file. Keychain operations map scopes to `ctxindex/<scope>`; writes publish inventory before the credential and compensate a failed value write, while deletes retain a discoverable stale entry when index cleanup fails.
3. On a missing config, `initializeSecretBackend()` probes Keychain first through one reserved credential whose deletion is always attempted after a successful write, probes/prepares file storage only if needed, then atomically persists the selected backend; existing configs are never reselected.
4. A backend switch validates source references, copies and verifies target values, transactionally rewrites local OAuth App config and Grant snapshot/token refs, commits config, and only then attempts bounded source cleanup. Pre-commit failures leave source or mixed typed refs readable, retries converge, and post-commit cleanup failures become bounded warnings rather than rollback.
5. Status probes both stores and reports only availability and typed reference counts. File probes verify keyed envelope checks without decrypting record plaintext; status never indexes, opens, or renders secret values.

## Integration points

- Uses `packages/core/src/config/` for backend persistence and passphrase/mock environment settings, `packages/core/src/paths/` for `secrets.box`/`secret.key`, and `CtxindexDatabase` for transactional Grant-ref rewrites.
- `packages/core/src/oauth-app/` and `packages/core/src/auth/` consume `SecretVault`; `apps/cli/src/deps.ts` wires vault/manager instances, and `apps/cli/src/commands/secrets.ts` invokes status/switch behavior without accepting secret values.
- `packages/core/src/testing/sandbox.ts` and `scripts/verify/full-test-suite.sh` install isolated file-backed Keychain mocks so automated tests cannot touch a user's native Keychain.
- `index.ts` is the sole capability Interface, exporting backend stores, vault, manager, initialization, and opaque ref/error types through `@ctxindex/core/secrets`.
