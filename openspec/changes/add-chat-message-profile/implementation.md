## Capability Implementation Targets

- `profile-vocabulary` -> `openspec/specs/profile-vocabulary/implementation.md`

## Module Ownership

`@ctxindex/profiles` owns the `chat-message` module, its strict Zod payload schema, inferred public payload type, compound-natural-key helper, declarative Profile value, search projection, Relations, and Artifact extraction. It depends only on `@ctxindex/extension-sdk` authoring contracts and Zod.

Core and the CLI continue to consume erased loaded Profile definitions. They must not import the chat schema, branch on its id, or duplicate its field and relation vocabulary. Future provider Adapters import the exact Profile value through its package subpath and own mapping from provider DTOs.

## Interfaces and Data Flow

The public module surface is:

```ts
export type ChatMessage = z.infer<typeof chatMessageSchema>

export function chatMessageNaturalKey(
  conversationKey: string,
  providerMessageId: string,
): string

export const chatMessageSchema: z.ZodType<...>

export const chatMessageProfile: ProfileDefinition<
  'chat.message',
  1,
  typeof chatMessageSchema
>
```

`chatMessageNaturalKey` serializes the ordered two-string tuple as JSON. Profile field extraction and provider-id reply Relation extraction call this one helper, preventing identity drift. The payload schema validates before vocabulary hooks run. Hooks then emit plain search values, field values, Relation targets, and copied Artifact descriptors; they perform no I/O and throw no errors for validated payloads.

The Profile exposes no Actions or exports. Future Adapters receive no helper that converts provider-specific rich content because provider mapping remains Adapter-owned.

## Storage and State

No new storage or state owner exists. Generic materialization stores the Profile id/version, payload, extracted chunks, typed fields, Relations, and Artifact descriptors through existing paths. Compound message and conversation keys are ordinary typed fields; they do not create a new external-reference table or uniqueness constraint.

## Security and Compatibility

The module performs no egress, authentication, secret access, provider mutation, or byte download. Strict schemas reject unknown provider-specific fields at every declared object boundary. Display values are plain untrusted text and receive no rendering privilege.

The addition is compatible with existing pre-alpha payloads because `mail.message@1` and core traversal contracts remain unchanged. The package gains additive root and `./chat-message` exports.

## Verification

Focused tests must cover strict minimal and full payload validation, text-or-attachment refinement, timestamp ordering, nested unknown-property rejection, sender structure, deterministic title/chunks/fields, compound natural keys, exact-Ref and provider-id parent Relations, conversation Relations, Artifact extraction, absence of Actions/exports, and provider/core independence.

Package typecheck and lint must cover the public exports. Strict OpenSpec validation must cover the change artifacts and canonical specs. Repository architecture verification remains the cross-cutting guard against domain-specific core coupling.

## Promotion Notes

Merge into `openspec/specs/profile-vocabulary/implementation.md` the `ChatMessage` public type and `chatMessageNaturalKey` signature, plus doctrine that `@ctxindex/profiles` owns the independent chat schema/projections and core consumes only generic Profile hooks.
