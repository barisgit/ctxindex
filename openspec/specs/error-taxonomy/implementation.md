# Error Taxonomy Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/core — error families

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
  | 'missing_oauth_app_config'
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

Direct Extension lifecycle errors use the public `extension_target_invalid`,
`extension_trust_required`, `extension_removal_blocked`,
`extension_acquisition_failed`, `extension_validation_failed`, and
`extension_conflict` codes. Parser failures precede effects, acquisition errors
are sanitized at the package boundary, and install/update publication remains
atomic so an earlier valid pin survives every failure stage.

### @ctxindex/core — secret backend errors

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

### @ctxindex/core — registry errors

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

### @ctxindex/core — stable exit mapping

```ts
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]

export interface ErrorMapping {
  exitCode: ExitCode
  runStatus: 'failed' | 'cancelled'
  lastStatus: 'needs_auth' | 'failed' | 'disabled' | 'idle'
}

export function mapSyncErrorCode(code: CtxindexSyncErrorCode): ErrorMapping;
```

### @ctxindex/cli — final error translation

```ts
export function mapErrorToExit(err: unknown): number;

export async function runWithExit(
  handler: () => number | Promise<number>,
): Promise<void>;
```

## Implementation doctrine

Core deep modules throw typed `CtxindexError` subclasses with stable machine codes and optional causes. Sync errors additionally carry retryability and bounded summaries. Secret and registry errors remain typed at their owning module seams and are translated only at orchestration boundaries.

One core storage classifier translates SQLite busy and locked result families, including extended result codes, to `CtxindexError` code `storage_busy` at database open/setup, migration, and Resource batch boundaries. Its public message identifies temporary local-storage unavailability and an actionable retry without copying backend codes or lock text; the original SQLite exception is retained as `cause` for diagnostics. Required operations use the existing generic exit-50 fallback, optional remote-search caching degrades to a successful warning, and cancellation retains its existing outcome and exit 130.

`missing_oauth_app_config` is the sole persisted App/snapshot configuration failure code and retains exit `50`; no `missing_oauth_client_creds` alias exists. Unknown explicit Provider/App selection, unavailable or ambiguous managed-default selection, and missing or invalid `oauth-app add --from-env` configuration remain invalid usage at exit `2` and are rejected before effects.

Missing managed policy and exact managed-App resolution failures use `invalid_oauth_selection` plus only static `oauth-app add <provider> <label> --from-env` and `account add <provider> --app <label>` guidance. After exact App resolution succeeds, Provider and authorization failures retain their existing typed categories, exits, and messages without selection fallback. Neither path starts another authorization or exposes App config, client ids, environment values, secret references, tokens, codes, verifiers, raw Provider responses, private identities, or state outside the dedicated authorization-URL surface.

`@ctxindex/core` maps sync codes to run/status state and stable exits. The sync runner classifies validated warning emissions separately from thrown terminal errors; warning aggregation never changes the error-code mapping. `@ctxindex/cli` is the final error-translation boundary; command handlers do not invent independent mappings.

Detached daemon startup and readiness failures reuse the bounded `daemon_unavailable` failure and stable exit `50`; lifecycle cancellation remains exit `130`, and explicit pre-init `invalid_args` guidance remains exit `2`. Already-running start and already-stopped stop are successful typed results. Unsupported-platform status is also a successful observational result, while explicit start fails through exit `50`. User-facing lifecycle errors never reflect raw endpoint/executable paths, child output, host errors, stacks, causes, environment contents, provider data, or secrets; unexpected runtime/discovery exceptions become fixed action-specific lifecycle messages.

## Verification

Error and exit-mapping tests cover every code family, cause preservation, sync state mapping, warning-only success, redaction, unknown-error fallback, and storage-contention normalization across setup, migration, and Resource writes. CLI command tests assert stable managed and explicit-App exits, zero-effect invalid selection/import, static BYOA guidance without automatic retry, the persisted App-config code, absence of the removed Client code, and absence of raw SQLite contention details.
