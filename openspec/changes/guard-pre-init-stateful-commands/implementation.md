## Capability Implementation Targets

- `cli-surface` → `openspec/specs/cli-surface/implementation.md`

## Module Ownership

The CLI command-dependency boundary owns initialization preflight. Core continues to own config paths, secret backend initialization, and database bootstrap independently. Command handlers may invoke the shared preflight earlier only when they otherwise read sensitive input before opening common dependencies.

## Interfaces and Data Flow

`assertInitialized(): Promise<void>` checks existence of `configPath()` and throws a fixed `CtxindexError` with code `invalid_args` when absent. `getDb()` calls it before `openDatabase()`. The Client handler parses arguments and preserves help/usage and unknown-provider validation, then calls `assertInitialized()` before reading declared environment credentials or opening dependencies.

`initCtxindex()` bypasses `getDb()`: it runs `initializeSecretBackend()` first and `bootstrapDatabase()` second, retaining the existing safe selection order.

## Storage and State

Rejected pre-init commands create no config, database, secrets file, secret key, or Keychain mock entry. A successfully persisted config remains the durable lifecycle marker.

## Security and Compatibility

The preflight performs no secret read, backend probe, provider request, or database write. Its fixed diagnostic contains no paths or secret material. The `invalid_args` code preserves stable exit 2. Existing initialized state and command syntax are unchanged.

## Verification

Focused Client e2e coverage starts from an empty sandbox, supplies synthetic declared credentials, asserts exit 2 and init guidance, asserts no canary output, and proves no durable files were created. A second command-level regression proves another database-backed surface receives the same guard while `--help` and `init` remain available. Existing initialized Client and V1 workflow suites prove normal behavior.

## Promotion Notes

Before archive, merge into `openspec/specs/cli-surface/implementation.md`: config-existence initialization preflight ownership, central `getDb()` enforcement, Client's earlier credential-safe check, the fixed exit-2 diagnostic, and fresh-state no-side-effect verification.
