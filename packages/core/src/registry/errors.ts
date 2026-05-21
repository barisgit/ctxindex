import { CtxindexError } from '@ctxindex/core/errors'

export type CtxindexRegistryErrorCode =
  | 'registry_unknown_adapter'
  | 'registry_unknown_namespace'
  | 'registry_unknown_provider'
  | 'registry_unsupported_mode'
  | 'registry_mode_required'

export class CtxindexRegistryError extends CtxindexError {
  readonly metadata: Record<string, unknown>

  constructor(
    message: string,
    code: CtxindexRegistryErrorCode,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, code)
    this.name = 'CtxindexRegistryError'
    this.metadata = metadata
  }
}
