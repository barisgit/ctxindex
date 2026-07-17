# Error Taxonomy Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/core/src/errors.ts`

```ts
export type CtxindexSyncErrorCode =
  | 'auth_expired'
  | 'auth_revoked'
  | 'rate_limited'
  | 'network'
  | 'provider_unavailable'
  | 'provider_bad_response'
  | 'provider_quota'
  | 'not_found'
  | 'permission_denied'
  | 'cancelled'
  | 'unknown'
  | 'not_implemented_yet'

export interface CtxindexErrorOptions {
  readonly cause?: unknown
}

export class CtxindexError extends Error {
  readonly code: string
  override readonly cause?: unknown
  constructor(message: string, code: string, options?: CtxindexErrorOptions);
}

export type CtxindexAuthErrorCode =
  | 'needs_auth'
  | 'missing_oauth_client_creds'
  | 'invalid_grant'
  | 'invalid_client'
  | 'oauth_failed'
  | 'oauth_host_denied'
  | 'insufficient_scope'
  | 'token_response_invalid'
  | 'identity_response_invalid'
  | 'authorization_denied'
  | 'loopback_timeout'
  | 'missing_code'
  | 'state_mismatch'
  | 'network_error'
  | 'token_refresh_failed'
  | 'unknown_auth_error'
  | 'unknown'
  | 'not_implemented_yet'

export class CtxindexAuthError extends CtxindexError {
  override readonly code: CtxindexAuthErrorCode
  constructor(
      code: CtxindexAuthErrorCode,
      message: string,
      options?: CtxindexErrorOptions,
    );
}

export class CtxindexNotFoundError extends CtxindexError {
  override readonly code = 'not_found'
  constructor(message: string, options?: CtxindexErrorOptions);
}

export type CtxindexValidationErrorCode =
  | 'invalid_account_identity'
  | 'invalid_oauth_selection'
  | 'duplicate_realm_slug'
  | 'unknown_realm'
  | 'invalid_filter'
  | 'invalid_ref'
  | 'invalid_artifact_ref'
  | 'invalid_artifact_retention'
  | 'unsupported_export_format'
  | 'ref_source_mismatch'
  | 'unknown_action'
  | 'invalid_action_input'
  | 'action_unsupported'
  | 'confirmation_required'

export class CtxindexValidationError extends CtxindexError {
  override readonly code: CtxindexValidationErrorCode
  constructor(
      code: CtxindexValidationErrorCode,
      message: string,
      options?: CtxindexErrorOptions,
    );
}

export type CtxindexConfigErrorCode =
  | 'secret_must_be_uri'
  | 'secret_uri_invalid'
  | 'env_var_unset'
  | 'env_loader_invalid'

export interface CtxindexConfigErrorOptions extends CtxindexErrorOptions {
  readonly field?: string
  readonly envVar?: string
}

export class CtxindexConfigError extends CtxindexError {
  override readonly code: CtxindexConfigErrorCode
  readonly field?: string
  readonly envVar?: string
  constructor(
      message: string,
      code: CtxindexConfigErrorCode,
      options?: CtxindexConfigErrorOptions,
    );
}

export interface CtxindexSyncErrorOptions extends CtxindexErrorOptions {
  readonly retryAfterMs?: number
}

export class CtxindexSyncError extends CtxindexError {
  override readonly code: CtxindexSyncErrorCode
  readonly retryAfterMs?: number
  constructor(
      message: string,
      code: CtxindexSyncErrorCode,
      options?: CtxindexSyncErrorOptions,
    );
}
```

### `packages/core/src/secrets/types.ts`

```ts
export type CtxindexSecretsErrorCode =
  | 'backend_unavailable'
  | 'not_found'
  | 'invalid_ref'
  | 'invalid_key'
  | 'decrypt_failed'
  | 'io'
  | 'unknown'

export class CtxindexSecretsError extends CtxindexError {
  override readonly code: CtxindexSecretsErrorCode
  constructor(
      message: string,
      code: CtxindexSecretsErrorCode,
      options?: { cause?: unknown },
    );
}
```

### `packages/core/src/registry/profile-registry.ts`

```ts
export type DefinitionRegistryErrorCode =
  | 'invalid_definition'
  | 'duplicate_definition'
  | 'unknown_profile_version'
  | 'capability_operation_mismatch'
  | 'unknown_profile'
  | 'action_binding_mismatch'

export class DefinitionRegistryError extends Error {
  constructor(
      message: string,
      readonly code: DefinitionRegistryErrorCode,
      readonly details: Readonly<Record<string, unknown>> = {},
    );
}
```

### `packages/core/src/exit-codes.ts`

```ts
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]

export interface ErrorMapping {
  exitCode: ExitCode
  runStatus: 'failed' | 'cancelled'
  lastStatus: 'needs_auth' | 'failed' | 'disabled' | 'idle'
}

export function mapSyncErrorCode(code: CtxindexSyncErrorCode): ErrorMapping;
```

### `apps/cli/src/format/exit.ts`

```ts
export function mapErrorToExit(err: unknown): number;

export async function runWithExit(
  handler: () => number | Promise<number>,
): Promise<void>;
```

## Implementation doctrine

Core deep modules throw typed `CtxindexError` subclasses with stable machine codes and optional causes. Sync errors additionally carry retryability and bounded summaries. Secret and registry errors remain typed at their owning module seams and are translated only at orchestration boundaries.

`packages/core/src/exit-codes.ts` maps sync codes to run/status state and stable exits. `apps/cli/src/format/exit.ts` is the final CLI translation point; command handlers do not invent independent mappings.

## Verification

Error and exit-mapping tests cover every code family, cause preservation, sync state mapping, redaction, and unknown-error fallback. CLI command tests assert the stable public exit codes.
