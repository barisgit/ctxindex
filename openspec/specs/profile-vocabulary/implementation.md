# Profile Vocabulary Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/extension-sdk/src/reference.ts`

```ts
export type DefinitionVersion = number

export type ProfileReference<
  TId extends string = string,
  TVersion extends number = number,
> = {
  readonly id: TId
  readonly version: TVersion
}
```

### `packages/extension-sdk/src/profile.ts`

```ts
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
    readonly summary?: (payload: z.infer<TSchema>) => string | null
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
): ProfileDefinition<TId, TVersion, TSchema>;
```

### `packages/profiles/src/calendar-event.ts`

```ts
export type CalendarEvent = z.infer<typeof calendarEventSchema>

export function calendarEventRef(
  sourceId: string,
  opaqueEventId: string,
): string;
```

### `packages/profiles/src/file.ts`

```ts
export interface FileChunk {
  index: number
  content: string
}

export function chunkText(text: string): FileChunk[];

export function isNormalizedRelativeFilePath(path: string): boolean;
```

### Bundled Profile definition exports

```ts
// packages/profiles/src/calendar-event.ts
export { calendarEventSchema, calendarEventProfile }
export type { CalendarEvent }

// packages/profiles/src/communication-message.ts
export {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
  communicationMessageSchema,
  communicationMessageProfile,
}

// packages/profiles/src/file.ts
export { fileSchema, fileProfile }
```

## Implementation doctrine

`packages/extension-sdk` owns plain versioned authoring contracts and const-generic factories; it creates no runtime class identity. `packages/profiles` owns bundled schemas and pure vocabulary. Core registries erase authored definitions to runtime-safe interfaces and bind by `(id, version)`.

Profiles own validation, titles/summaries, chunks, typed fields, Relations, Artifact descriptors, exports, docs/aliases/examples, and Action declarations. Adapters own provider I/O. Loaded registry metadata drives describe, kind aliases, field parsing, Source config, exports, and Action discovery.

## Verification

SDK factory/public-surface tests protect inference and contracts. Profile tests protect schemas and deterministic projections. Registry and CLI interface tests cover validation, duplicate rejection, aliases, and generated describe metadata.
