import type {
  AnyProfileDefinition,
  ProfileReference,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'

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
const referenceSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
})
const profileDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  schema: schemaSchema,
  search: z
    .object({
      title: functionSchema.optional(),
      occurredAt: functionSchema.optional(),
      chunks: functionSchema.optional(),
      fields: z
        .record(
          z.string(),
          z.object({
            type: z.enum([
              'string',
              'string[]',
              'number',
              'number[]',
              'boolean',
              'datetime',
            ]),
            extract: functionSchema,
            docs: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  relations: z.record(z.string(), functionSchema).optional(),
  artifacts: functionSchema.optional(),
  exports: z
    .record(
      z.string(),
      z.object({ mediaType: z.string().min(1), render: functionSchema }),
    )
    .optional(),
  actions: z
    .record(
      z.string(),
      z.object({
        effect: z.enum(['reversible', 'irreversible']),
        input: schemaSchema,
        output: referenceSchema,
        docs: z.string().min(1),
        examples: z.array(z.unknown()).readonly().optional(),
      }),
    )
    .optional(),
  docs: z
    .object({
      summary: z.string().min(1),
      aliases: z.array(z.string().min(1)).readonly().optional(),
      examples: z.array(z.unknown()).readonly().optional(),
    })
    .optional(),
})

function definitionKey(reference: ProfileReference): string {
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

  get(reference: ProfileReference): AnyProfileDefinition | undefined {
    return this.#profiles.get(definitionKey(reference))
  }

  resolve(reference: ProfileReference): ProfileResolution {
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
