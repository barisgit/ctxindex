# Secret Backend Operations Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/core/src/secrets/types.ts`

```ts
export interface SecretsStore {
  getSecret(ref: string): Promise<string>
  setSecret(scope: string, key: string, value: string): Promise<string>
  deleteSecret(ref: string): Promise<void>
  listKeys(): Promise<{ ref: string; scope: string; key: string }[]>
}

export type SecretBackend = 'keychain' | 'file'

export interface ParsedKeychainRef {
  readonly backend: 'keychain'
  readonly scope: string
  readonly key: string
}

export interface ParsedFileRef {
  readonly backend: 'file'
  readonly scope: string
  readonly key: string
}

export type ParsedSecretRef = ParsedKeychainRef | ParsedFileRef

export function keychainRef(scope: string, key: string): string;

export function fileRef(scope: string, key: string): string;

export function parseSecretRef(ref: string): ParsedSecretRef;
```

### `packages/core/src/secrets/vault.ts`

```ts
export interface SecretVaultDeps {
  readonly backend: SecretBackend
  readonly fileStore: SecretsStore
  readonly keychainStore: SecretsStore
}

export interface SecretVault extends SecretsStore {
  readonly backend: SecretBackend
}

export function createSecretVault(deps: SecretVaultDeps): SecretVault;
```

### `packages/core/src/secrets/initialize.ts`

```ts
export interface InitializeSecretBackendOptions {
  readonly filePath?: string
  readonly file?: FileBackendOptions
  readonly keychain?: KeychainBackendOptions
}

export async function initializeSecretBackend(
  options: InitializeSecretBackendOptions = {},
): Promise<SecretBackend>;
```

### `packages/core/src/secrets/backend-manager.ts`

```ts
type SecretEntry = {
  readonly ref: string
  readonly scope: string
  readonly key: string
}

type GrantSecretRow = {
  readonly id: string
  readonly client_id_ref: string | null
  readonly client_secret_ref: string | null
  readonly access_token_ref: string | null
  readonly refresh_token_ref: string | null
}

export interface SecretBackendManagerDeps {
  readonly db: CtxindexDatabase
  readonly fileStore: SecretsStore
  readonly keychainStore: SecretsStore
  readonly logger: Logger
  readonly backend: SecretBackend
  readonly commitBackend: (target: SecretBackend) => Promise<void>
}

export interface SecretBackendStatus {
  readonly backend: SecretBackend
  readonly backends: Readonly<
    Record<
      SecretBackend,
      { readonly available: boolean; readonly referenceCount: number }
    >
  >
}

export interface SecretBackendSwitchResult {
  readonly backend: SecretBackend
  readonly copied: number
  readonly cleaned: number
  readonly cleanupPending: boolean
  readonly warnings: readonly string[]
}

export interface SecretBackendManager {
  getStatus(): Promise<SecretBackendStatus>
  switchBackend(target: SecretBackend): Promise<SecretBackendSwitchResult>
}

export function createSecretBackendManager(
  deps: SecretBackendManagerDeps,
): SecretBackendManager;
```

## Implementation doctrine

`packages/core/src/secrets` owns the routing Vault, Keychain/file stores, initialization, and backend manager. Typed reference prefixes route reads/deletes; new writes use the configured backend. Runtime failures never silently change selection, and values/passphrases stay out of argv and logs.

Switching copies and verifies target values, transactionally updates database references, atomically commits config, then cleans old copies. Cleanup failure leaves usable target state and a pending warning. Prefix routing keeps mixed references readable across interruption.

## Verification

Vault tests cover prefix routing and mixed references. Backend-manager tests cover ordering and interruption. Keychain/file tests cover availability, permissions, encryption, and safe errors; CLI tests cover stdin/TTY input and redacted status.
