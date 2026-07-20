import { CtxindexError, CtxindexValidationError } from '../errors'
import type {
  RetrieveSourceResourceInput,
  SourceResourceWarning,
} from '../source'
import { getSourceResource } from '../source'

export interface ExportResourceInput extends RetrieveSourceResourceInput {
  readonly format: string
}

export interface ExportResourceResult {
  readonly bytes: Uint8Array
  readonly mediaType: string
  readonly format: string
  readonly ref: string
  readonly warnings: readonly SourceResourceWarning[]
}

interface ProfileIdentity {
  readonly id: string
  readonly version: number
}

export class UnsupportedExportFormatError extends CtxindexValidationError {
  readonly validFormats: readonly string[]
  readonly profile: ProfileIdentity

  constructor(
    profile: ProfileIdentity,
    format: string,
    validFormats: readonly string[],
  ) {
    super(
      'unsupported_export_format',
      `Unsupported export format "${format}" for ${profile.id}@${profile.version}; valid formats: ${validFormats.join(', ')}`,
    )
    this.name = 'UnsupportedExportFormatError'
    this.profile = profile
    this.validFormats = validFormats
  }
}

export class ExportDataIntegrityError extends CtxindexError {
  override readonly code = 'data_integrity'

  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, 'data_integrity', options)
    this.name = 'ExportDataIntegrityError'
  }
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue)
  if (value && typeof value === 'object') {
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      return stableJsonValue(value.toJSON())
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    )
  }
  return value
}

export async function exportSourceResource(
  input: ExportResourceInput,
): Promise<ExportResourceResult> {
  const retrieved = await getSourceResource(input)
  const { resource } = retrieved
  const profile = input.registry.profiles.get(resource.profile)
  if (!profile) {
    throw new ExportDataIntegrityError(
      `Cannot export ${resource.ref}: Profile ${resource.profile.id}@${resource.profile.version} is unavailable`,
    )
  }
  const validFormats = [
    ...new Set(['json', ...Object.keys(profile.exports ?? {})]),
  ].sort()
  if (!validFormats.includes(input.format)) {
    throw new UnsupportedExportFormatError(
      resource.profile,
      input.format,
      validFormats,
    )
  }
  if (resource.payload === null) {
    throw new ExportDataIntegrityError(
      `Cannot export ${resource.ref}: validated payload is unavailable`,
    )
  }
  const parsed = profile.schema.safeParse(resource.payload)
  if (!parsed.success) {
    throw new ExportDataIntegrityError(
      `Cannot export ${resource.ref}: payload failed Profile ${profile.id}@${profile.version} validation`,
      { cause: parsed.error },
    )
  }

  if (input.format === 'json') {
    return {
      bytes: new TextEncoder().encode(
        JSON.stringify(stableJsonValue(parsed.data)),
      ),
      mediaType: 'application/json',
      format: input.format,
      ref: resource.ref,
      warnings: retrieved.warnings,
    }
  }

  const declared = profile.exports?.[input.format]
  if (!declared) {
    throw new ExportDataIntegrityError(
      `Profile ${profile.id}@${profile.version} export "${input.format}" is unavailable`,
    )
  }
  const rendered = declared.render(parsed.data, undefined)
  if (typeof rendered !== 'string' && !(rendered instanceof Uint8Array)) {
    throw new ExportDataIntegrityError(
      `Profile ${profile.id}@${profile.version} export "${input.format}" returned invalid bytes`,
    )
  }
  return {
    bytes:
      typeof rendered === 'string'
        ? new TextEncoder().encode(rendered)
        : rendered,
    mediaType: declared.mediaType,
    format: input.format,
    ref: resource.ref,
    warnings: retrieved.warnings,
  }
}
