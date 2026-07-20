import type { AnyProfileDefinition } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { isDefinitionId } from './definition-id'

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
  ) {
    super(message)
    this.name = 'DefinitionRegistryError'
  }
}

const functionSchema = z.custom<(...args: readonly unknown[]) => unknown>(
  (value) => typeof value === 'function',
)
const schemaSchema = z.custom<z.ZodTypeAny>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof value.safeParse === 'function',
)
const referenceSchema = z
  .object({
    id: z.string().refine(isDefinitionId, 'Invalid definition id'),
    version: z.number().int().positive(),
  })
  .strict()
const profileDefinitionSchema = z
  .object({
    kind: z.literal('profile'),
    id: z.string().refine(isDefinitionId, 'Invalid definition id'),
    version: z.number().int().positive(),
    schema: schemaSchema,
    search: z
      .object({
        title: functionSchema.optional(),
        summary: functionSchema.optional(),
        occurredAt: functionSchema.optional(),
        chunks: functionSchema.optional(),
        fields: z
          .record(
            z.string(),
            z
              .object({
                type: z.enum([
                  'string',
                  'string[]',
                  'number',
                  'number[]',
                  'boolean',
                  'datetime',
                ]),
                extract: functionSchema,
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    relations: z.record(z.string(), functionSchema).optional(),
    artifacts: functionSchema.optional(),
    exports: z
      .record(
        z.string(),
        z
          .object({ mediaType: z.string().min(1), render: functionSchema })
          .strict(),
      )
      .optional(),
    actions: z
      .record(
        z.string().min(1),
        z
          .object({
            effect: z.enum(['reversible', 'irreversible']),
            input: schemaSchema,
            output: referenceSchema,
          })
          .strict(),
      )
      .optional(),
  })
  .strict()

export interface ProfileIdentity {
  readonly id: string
  readonly version: number
}

function definitionKey(reference: ProfileIdentity): string {
  return `${reference.id}@${reference.version}`
}

export interface UnknownProfileWarning {
  readonly code: 'unknown_profile_version'
  readonly profileId: string
  readonly profileVersion: number
}

export type ProfileResolution =
  | { readonly status: 'known'; readonly profile: AnyProfileDefinition }
  | {
      readonly status: 'degraded'
      readonly id: string
      readonly version: number
    }

export type KindResolution =
  | {
      readonly status: 'known'
      readonly id: string
      readonly profiles: readonly AnyProfileDefinition[]
    }
  | {
      readonly status: 'ambiguous'
      readonly kind: string
      readonly candidates: readonly string[]
    }
  | { readonly status: 'unknown'; readonly kind: string }

export interface ProfileRegistryOptions {
  readonly onWarning?: (warning: UnknownProfileWarning) => void
}

export class ProfileRegistry {
  readonly #profiles = new Map<string, AnyProfileDefinition>()

  constructor(
    profiles: readonly AnyProfileDefinition[],
    readonly options: ProfileRegistryOptions = {},
  ) {
    for (const profile of profiles) {
      const result = profileDefinitionSchema.safeParse(profile)
      if (!result.success) {
        throw new DefinitionRegistryError(
          `Invalid Profile definition: ${result.error.issues[0]?.message ?? 'validation failed'}`,
          'invalid_definition',
          { issues: result.error.issues },
        )
      }
      const key = definitionKey(profile)
      if (this.#profiles.has(key)) {
        throw new DefinitionRegistryError(
          `Duplicate Profile ${key}`,
          'duplicate_definition',
          { id: profile.id, version: profile.version },
        )
      }
      this.#profiles.set(key, profile)
    }
  }

  list(): readonly AnyProfileDefinition[] {
    return [...this.#profiles.values()]
  }

  get(reference: ProfileIdentity): AnyProfileDefinition | undefined {
    return this.#profiles.get(definitionKey(reference))
  }

  resolveKind(value: string): KindResolution {
    const kind = value.trim().toLocaleLowerCase()
    const profiles = this.list()
    const canonicalIds = new Set(
      profiles
        .map((profile) => profile.id)
        .filter((id) => id.toLocaleLowerCase() === kind),
    )
    const ids = canonicalIds
    if (ids.size === 0) return { status: 'unknown', kind }
    const candidates = [...ids].sort()
    if (candidates.length > 1) {
      return { status: 'ambiguous', kind, candidates }
    }
    const id = candidates[0] as string
    return {
      status: 'known',
      id,
      profiles: profiles
        .filter((profile) => profile.id === id)
        .sort((left, right) => left.version - right.version),
    }
  }

  resolve(reference: ProfileIdentity): ProfileResolution {
    const profile = this.get(reference)
    if (profile) {
      return { status: 'known', profile }
    }
    this.options.onWarning?.({
      code: 'unknown_profile_version',
      profileId: reference.id,
      profileVersion: reference.version,
    })
    return { status: 'degraded', id: reference.id, version: reference.version }
  }
}

export function createProfileRegistry(
  profiles: readonly AnyProfileDefinition[],
  options?: ProfileRegistryOptions,
): ProfileRegistry {
  return new ProfileRegistry(profiles, options)
}
