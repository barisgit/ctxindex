# Provider Actions Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/extension-sdk — Profile Action declarations

```ts
export interface ProfileAction<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly effect: 'reversible' | 'irreversible'
  readonly input: TInput
  readonly output: ProfileReference
  readonly docs: string
  readonly examples?: readonly unknown[]
}
```

### @ctxindex/extension-sdk — Adapter Action bindings

```ts
export interface AdapterActionBinding<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly profile: ProfileReference
  readonly input: TInput
  readonly output: ProfileReference
  readonly run: {
    bivarianceHack(
      context: ActionContext<z.infer<TInput>>,
    ): RetrievedResource | Promise<RetrievedResource>
  }['bivarianceHack']
}
```

### @ctxindex/extension-sdk — Action operation context

```ts
export interface ActionArtifact {
  readonly ref: string
  readonly originRef: string
  readonly filename: string
  readonly mediaType: string
  readonly byteSize: number
  readonly bytes: Uint8Array
}

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
  readonly resolveArtifact: (
    ref: string,
    maxByteSize?: number,
  ) => Promise<ActionArtifact | null>
}
```

### @ctxindex/core — Action discovery

```ts
export interface ActionSourceAvailability {
  readonly id: string
  readonly adapter: { readonly id: string; readonly version: number }
  readonly available: boolean
  readonly reason?: 'adapter_unavailable' | 'action_unsupported'
}

export interface DescribeActionInput {
  readonly db: CtxindexDatabase
  readonly registry: ExtensionRegistry
  readonly actionId: string
  readonly sourceId?: string
}

export interface DescribeActionResult extends ActionDescription {
  readonly sources: readonly ActionSourceAvailability[]
}

export function describeAction(
  input: DescribeActionInput,
): DescribeActionResult;
```

### @ctxindex/core — Action execution

```ts
export interface RunActionInput
  extends Omit<
    CreateSourceProviderContextInput,
    'sourceId' | 'retryUnauthorized'
  > {
  readonly actionId: string
  readonly sourceId: string
  readonly actionInput: unknown
  readonly signal: AbortSignal
  readonly confirmIrreversible?: boolean
}

export interface ActionResourceWarning {
  readonly code: string
  readonly message: string
  readonly ref: string
}

export interface RunActionResult {
  readonly resource: StoredResource
  readonly warnings: readonly ActionResourceWarning[]
}

export async function runAction(
  input: RunActionInput,
): Promise<RunActionResult>;
```

### @ctxindex/adapters — Gmail Draft contracts

```ts
export type GmailDraftCreateInput = z.infer<
  typeof communicationMessageDraftCreateInputSchema
>

export type GmailDraftUpdateInput = z.infer<
  typeof communicationMessageDraftUpdateInputSchema
>

export async function gmailDraftUpdate(
  context: ActionContext<GmailDraftUpdateInput>,
): Promise<RetrievedResource>;

export function buildGmailDraftRaw(input: GmailDraftCreateInput): string;

export async function gmailDraftCreate(
  context: ActionContext<GmailDraftCreateInput>,
): Promise<RetrievedResource>;
```

### @ctxindex/adapters — Microsoft Draft contracts

```ts
export type MicrosoftDraftCreateInput = z.infer<
  typeof communicationMessageDraftCreateInputSchema
>

export type MicrosoftDraftUpdateInput = z.infer<
  typeof communicationMessageDraftUpdateInputSchema
>

export async function microsoftDraftCreate(
  context: ActionContext<MicrosoftDraftCreateInput>,
): Promise<RetrievedResource>;

export async function microsoftDraftUpdate(
  context: ActionContext<MicrosoftDraftUpdateInput>,
): Promise<RetrievedResource>;
```

### @ctxindex/cli — Action command boundary

```ts
export type ActionDeps = Pick<
  CliDeps,
  'db' | 'registry' | 'authService' | 'logger' | 'sourceService' | 'close'
>

export interface ActionServices {
  readonly describe: typeof describeAction
  readonly run: typeof runAction
}

export async function handleActionCommand(
  args: string[],
  open: OpenActionDeps = openDeps,
  services: ActionServices = actionServices,
): Promise<number>;
```

## Implementation doctrine

Profiles own Action ids, input schemas, output Profile, effect, docs, and examples. Adapters bind implementations only for declared Actions. Core resolves the Source-bound binding, validates input before provider I/O, enforces effect confirmation, and injects a generic Source-scoped local Resource resolver before creating the provider context. The resolver exposes stored completeness and deletion state, rejects cross-Source Refs, and never retrieves or authenticates. Core validates the returned Ref/Profile/payload and stores complete ad-hoc output. Automatic 401 retry is disabled.

Gmail Draft identity uses the immutable Draft id; Outlook requests immutable Graph ids. Portable strict union inputs keep standalone content replacement unchanged while reply branches accept only local parent Ref and body text. A standalone update rejects a locally stored target that already carries reply context. Reply creation derives recipient, subject, and threading state locally; update preserves the stored Draft context while validating parent and provider identity before one provider mutation. MIME header values reject CR/LF. The CLI recursively renders each strict union branch and exposes only registry-derived `action describe` and `action run`; no provider-specific parallel command family or send route exists.

Draft create may name an ordered, non-empty set of strict managed Artifact Refs. Core supplies a selected-Source resolver that returns only current descriptor metadata and verified cached bytes without provider access. Adapters resolve and validate the complete set before their first fetch, render one deterministic safe MIME mutation, and record ordered `managedAttachmentRefs`. Update never accepts an attachment collection mutation: Microsoft omits attachments from its PATCH, while Gmail replays a locally proven managed set or fails before provider I/O when provenance or bytes are unavailable.

## Verification

SDK/registry tests cover declaration-binding consistency. Core and CLI tests cover resolution, validation, confirmation, output checks, and storage. Google/Microsoft Draft and no-send tests assert one mutation, stable identity, replacement semantics, and no retry/send affordance.
