import type { z } from 'zod'

export type DefinitionVersion = number

interface ProfileIdentity {
  readonly id: string
  readonly version: DefinitionVersion
}

type PayloadFunction<TPayload, TResult> = {
  bivarianceHack(payload: TPayload): TResult
}['bivarianceHack']

type PayloadRender<TPayload> = {
  bivarianceHack(
    payload: TPayload,
    dependencies?: unknown,
  ): ProfileExportRenderResult
}['bivarianceHack']

export type ProfileExportRenderResult = string | Uint8Array

export type ProfileRelationTarget =
  | { readonly ref: string }
  | { readonly field: string; readonly value: string }

export type ProfileRelationTargets =
  | ProfileRelationTarget
  | readonly ProfileRelationTarget[]
  | null
  | undefined

export interface ArtifactDescriptor {
  readonly ref: string
  readonly filename?: string | undefined
  readonly mediaType?: string | undefined
  readonly byteSize?: number | undefined
}

export interface ResolvedArtifactDescriptor extends ArtifactDescriptor {
  readonly originRef: string
}

export type FieldType =
  | 'string'
  | 'string[]'
  | 'number'
  | 'number[]'
  | 'boolean'
  | 'datetime'

export interface ProfileField<TPayload = unknown> {
  readonly type: FieldType
  readonly extract: PayloadFunction<TPayload, unknown>
}

export interface ProfileAction<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly effect: 'reversible' | 'irreversible'
  readonly input: TInput
  readonly output: ProfileIdentity
}

export interface ProfileDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly kind: 'profile'
  readonly id: TId
  readonly version: TVersion
  readonly schema: TSchema
  readonly search?: {
    readonly title?: PayloadFunction<z.infer<TSchema>, string | null>
    readonly summary?: PayloadFunction<z.infer<TSchema>, string | null>
    readonly occurredAt?: PayloadFunction<z.infer<TSchema>, Date | null>
    readonly chunks?: PayloadFunction<z.infer<TSchema>, readonly string[]>
    readonly fields?: Readonly<Record<string, ProfileField<z.infer<TSchema>>>>
  }
  readonly relations?: Readonly<
    Record<string, PayloadFunction<z.infer<TSchema>, ProfileRelationTargets>>
  >
  readonly artifacts?: PayloadFunction<
    z.infer<TSchema>,
    readonly ArtifactDescriptor[]
  >
  readonly exports?: Readonly<
    Record<
      string,
      {
        readonly mediaType: string
        readonly render: PayloadRender<z.infer<TSchema>>
      }
    >
  >
  readonly actions?: Readonly<Record<string, ProfileAction>>
}

export type AnyProfileDefinition = ProfileDefinition<
  string,
  number,
  z.ZodTypeAny
>

export type InferProfilePayload<TProfile extends AnyProfileDefinition> =
  z.infer<TProfile['schema']>

export function defineProfile<
  const TId extends string,
  const TVersion extends number,
  TSchema extends z.ZodTypeAny,
>(
  definition: Omit<ProfileDefinition<TId, TVersion, TSchema>, 'kind'>,
): ProfileDefinition<TId, TVersion, TSchema> {
  return { ...definition, kind: 'profile' }
}
