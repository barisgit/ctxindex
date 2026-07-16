# packages/core/src/secrets/

## Responsibility

Provides opaque secret-reference syntax, interchangeable encrypted-file and OS-keychain stores, backend selection, and migration of Grant credential references between stores.

## Design/patterns

- `SecretsStore` in `types.ts` is the storage strategy interface; `FileBackend` and `KeychainBackend` implement it and emit backend-qualified refs via `fileRef()`/`keychainRef()`.
- `loadSecretsStore()` is a backend factory selected by `CtxindexConfig.secrets.backend`.
- `FileBackend` uses an encrypted-envelope repository: XChaCha20-Poly1305 ciphertext, PBKDF2-SHA256 passphrase derivation or a 32-byte `secret.key`, atomic writes, and private permissions.
- `KeychainBackend` adapts `keytar`, maintaining a reserved key index because keychain reads are reference-based; `CtxindexSecretsError` normalizes backend/ref/I/O failures.

## Data & control flow

1. Callers create/parse opaque refs with helpers in `types.ts`; stores reject refs for the wrong backend.
2. File reads derive a key, decrypt `secrets.box`, and select a record; writes re-encrypt all records with fresh salt/nonce and atomically replace the file.
3. Keychain operations map scope to `ctxindex/<scope>`, update the reserved `ctxindex` index entry, and wrap keytar runtime errors.
4. `createSecretsService().migrateSecrets()` copies values to the target store, updates credential columns in `grants`, then deletes old entries; status counts refs for the configured backend without exposing values.

## Integration points

- Uses `packages/core/src/config/env-loader.ts` for passphrase/mock settings and `packages/core/src/paths/` for `secrets.box`/`secret.key` locations.
- `service.ts` updates `grants` through `CtxindexDatabase`; `packages/core/src/auth/` resolves those stored refs.
- `apps/cli/src/deps.ts` constructs stores/services, while `apps/cli/src/commands/secrets.ts` invokes availability and migration behavior.
- `index.ts` is the sole capability Interface, exporting file/keychain stores, opaque ref/error types, service APIs, and `loadSecretsStore()` through `@ctxindex/core/secrets`.
