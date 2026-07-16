import type { z } from 'zod'
import type { ProfileReference } from './reference'

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
  readonly extract: (payload: TPayload) => unknown
  readonly docs?: string
}

export interface ProfileAction<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly effect: 'reversible' | 'irreversible'
  readonly input: TInput
  readonly output: ProfileReference
  readonly docs: string
  readonly examples?: readonly unknown[]
}

export interface ProfileDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly id: TId
  readonly version: TVersion
  readonly schema: TSchema
  readonly search?: {
    readonly title?: (payload: z.infer<TSchema>) => string | null
    readonly occurredAt?: (payload: z.infer<TSchema>) => Date | null
    readonly chunks?: (payload: z.infer<TSchema>) => readonly string[]
    readonly fields?: Readonly<Record<string, ProfileField<z.infer<TSchema>>>>
  }
  readonly relations?: Readonly<
    Record<string, (payload: z.infer<TSchema>) => ProfileRelationTargets>
  >
  readonly artifacts?: (
    payload: z.infer<TSchema>,
  ) => readonly ArtifactDescriptor[]
  readonly exports?: Readonly<
    Record<
      string,
      {
        readonly mediaType: string
        readonly render: (
          payload: z.infer<TSchema>,
          dependencies?: unknown,
        ) => ProfileExportRenderResult
      }
    >
  >
  readonly actions?: Readonly<Record<string, ProfileAction>>
  readonly docs?: {
    readonly summary: string
    readonly aliases?: readonly string[]
    readonly examples?: readonly unknown[]
  }
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
  definition: ProfileDefinition<TId, TVersion, TSchema>,
): ProfileDefinition<TId, TVersion, TSchema> {
  return definition
}
