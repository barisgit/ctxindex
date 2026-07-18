# Profile Vocabulary Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/extension-sdk — versioned references

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

### @ctxindex/extension-sdk — Profile contracts

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

### @ctxindex/profiles — communication reply vocabulary

```ts
export type CommunicationMessage = z.infer<typeof communicationMessageSchema>

export function deriveCommunicationMessageReplyRecipient(
  payload: CommunicationMessage,
): string | undefined;

export function deriveCommunicationMessageReplySubject(
  subject: string | undefined,
): string;

export function deriveCommunicationMessageReplyReferences(
  references: readonly string[] | undefined,
  rfcMessageId: string,
): string[];
```

### @ctxindex/profiles — calendar event vocabulary

```ts
export type CalendarEvent = z.infer<typeof calendarEventSchema>

export function calendarEventRef(
  sourceId: string,
  opaqueEventId: string,
): string;
```

### @ctxindex/profiles — file vocabulary

```ts
export interface FileChunk {
  index: number
  content: string
}

export function chunkText(text: string): FileChunk[];

export function isNormalizedRelativeFilePath(path: string): boolean;
```

## Implementation doctrine

`@ctxindex/extension-sdk` owns plain versioned authoring contracts and const-generic factories; it creates no runtime class identity. `@ctxindex/profiles` owns bundled schemas and pure vocabulary. Core registries erase authored definitions to runtime-safe interfaces and bind by `(id, version)`.

Profiles own validation, titles/summaries, chunks, typed fields, Relations, Artifact descriptors, exports, docs/aliases/examples, and Action declarations. Adapters own provider I/O. Loaded registry metadata drives describe, kind aliases, field parsing, Source config, exports, and Action discovery.

## Verification

SDK factory/public-surface tests protect inference and contracts. Profile tests protect schemas and deterministic projections. Registry and CLI interface tests cover validation, duplicate rejection, aliases, and generated describe metadata.
