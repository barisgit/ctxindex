## Capability Implementation Targets

- `profile-vocabulary` → `openspec/specs/profile-vocabulary/implementation.md`
- `provider-actions` → `openspec/specs/provider-actions/implementation.md`
- `microsoft-graph-adapters` → `openspec/specs/microsoft-graph-adapters/implementation.md`
- `retrieval-and-artifacts` → `openspec/specs/retrieval-and-artifacts/implementation.md`

## Module Ownership

`@ctxindex/profiles` owns the discriminated standalone/reply input schemas, portable message payload fields, and pure reply-subject/reference helpers shared by provider adapters. `@ctxindex/extension-sdk` owns the provider-neutral Action context resolver contract. `@ctxindex/core` constructs that resolver from generic Resource storage and Source Ref parsing before it creates an authenticated provider context. `@ctxindex/adapters` owns eligibility checks against portable message payloads, provider identifiers, request construction, response normalization, and provider-specific mutation errors. `@ctxindex/cli` remains a thin consumer of the registry-derived schemas and Action service.

## Interfaces and Data Flow

The durable public Action seam extends `ActionContext<TInput>` with:

```ts
export interface ActionResource {
  readonly ref: string
  readonly sourceId: string
  readonly profile: ProfileReference
  readonly completeness: 'partial' | 'complete'
  readonly deletedAt: number | null
  readonly payload: unknown | null
}

export interface ActionContext<TInput = unknown> extends ProviderContext {
  readonly input: TInput
  readonly signal: AbortSignal
  readonly resolveResource: (ref: string) => ActionResource | null
}
```

Core parses and validates Action input, resolves the selected Source and binding, constructs a Source-scoped resolver over `ResourceStore.get(ref, { includeDeleted: true })`, and only then constructs the provider context. The resolver rejects a Ref whose parsed Source differs from `context.source.id`; it never retrieves or authenticates. Adapter code resolves and validates parent/target state synchronously before its first `context.fetch` call.

`communicationMessageDraftCreateInputSchema` and `communicationMessageDraftUpdateInputSchema` remain exported Zod schemas and become unions of strict standalone/reply objects. Their inferred types flow unchanged into both Draft adapter bindings. Portable helpers accept a validated message payload and return the deterministic reply recipient, subject, and References chain or a typed validation failure.

Gmail reply creation/update uses the existing Draft endpoint and response parser. The complete MIME raw value includes locally CR/LF-validated derived headers, while the JSON `message` object includes `threadId`. Microsoft reply creation posts to the parent message's `createReply` route and normalizes the returned Draft with `replyToRef`; update PATCHes the locally addressed Draft. Both providers reject a standalone update when the locally stored target carries reply context. Microsoft validates every derived MIME header against CR/LF injection and rejects a response whose normalized recipient, subject, semantically normalized text-body line endings, or conversation differs from the validated reply. Both providers return `RetrievedResource` values which core validates and materializes through the existing complete `adhoc` Action path.

## Storage and State

No new table or Adapter state is introduced. Optional `replyTo`, `references`, and `replyToRef` values live in the existing validated JSON payload. Existing Resource hydration, tombstone, origin, and stable Ref behavior remains owned by `ResourceStore`.

## Security and Compatibility

The resolver is local-only and Source-scoped; it cannot widen egress or credential access. Core keeps `retryUnauthorized: false`. Provider adapters use the existing Gmail and Graph approved hosts and scopes. No send scope, route, or Action is introduced. Strict reply branches prevent header injection and caller-controlled recipient/subject overrides. Existing standalone branches and optional payload fields remain source-compatible; no pre-release migration or alias is added.

## Verification

Profile tests cover strict union acceptance/rejection and portable helper determinism. Core Action tests cover Source scoping, deleted/incomplete/missing local state visibility, resolver availability before authentication, and zero provider I/O. Gmail and Microsoft focused tests cover normalized threading fields, exact request bodies/headers, immutable reply parent, stable Draft identity, one mutation, and no retry/send. Mocked CLI workflows cover generated schemas and end-to-end local materialization. Slice gates include affected package tests, architecture checks, compiled Extension e2e, full CI, strict OpenSpec validation, and change verification.

## Promotion Notes

- Merge the strict Draft union schema and portable reply helper/payload interface listings into `openspec/specs/profile-vocabulary/implementation.md`.
- Merge `ActionResource`, the Source-scoped `resolveResource` member, resolver construction order, and local-only failure boundary into `openspec/specs/provider-actions/implementation.md`.
- Merge native `createReply`, locally proven reply-parent immutability, and one-shot PATCH doctrine into `openspec/specs/microsoft-graph-adapters/implementation.md`.
- Merge the complete portable Reply-To/References normalization seam for Gmail and Microsoft retrieval into `openspec/specs/retrieval-and-artifacts/implementation.md`.
