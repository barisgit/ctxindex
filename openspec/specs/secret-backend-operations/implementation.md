# Secret Backend Operations Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/core — Secret Store contracts

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

### @ctxindex/core — routing Secret Vault

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

### @ctxindex/core — secret backend initialization

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

### @ctxindex/core — backend switching

```ts
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

`@ctxindex/core` owns the routing Secret Vault, Keychain/file stores, initialization, and backend manager. Typed reference prefixes route reads/deletes; new writes use the configured backend. Runtime failures never silently change selection. App config values, config keys, environment values, credentials, client ids, desktop-secret metadata, tokens, typed references, and passphrases stay out of status, inventory, argv, and logs. `oauth-app add --from-env` is the only App-config environment import; it uses the active Provider's typed top-level mapping and central loader, validates the complete config before writes, and cleans temporary references on persistence failure. Authorization snapshots persisted or active App config into Grant-owned references, and refresh never rereads environment config.

Keychain writes, deletes, inventory reads, and availability probes share one process-wide asynchronous critical section across backend instances. A write publishes its intended reserved-index entry before persisting the credential value and restores the prior index when value persistence fails; a delete removes the credential before its index entry so incomplete work remains discoverable and retryable. The probe reuses one reserved credential identity, always attempts deletion after a successful write, and treats read or deletion failure as unavailable so the next probe retries the same row. The queue always releases after failure. This is an in-process consistency boundary, not a cross-process lock or a new Keychain storage format.

Reference discovery includes local OAuth App config, private Grant App snapshots, and token references. Switching copies and verifies every target value, transactionally updates database references, atomically commits config, then cleans old copies. Cleanup failure leaves usable target state and a pending warning. Prefix routing keeps mixed references readable across interruption.

## Verification

Vault tests cover prefix routing and mixed references. Backend-manager tests cover local App, Grant snapshot, and token traversal, aggregate safe status, ordering, and interruption. Keychain/file tests cover availability, stable probe cleanup retry, permissions, encryption, safe errors, cross-instance concurrent mutations, publication failure, compensation, and retryable deletion; CLI tests cover stdin/TTY input and redacted status.
