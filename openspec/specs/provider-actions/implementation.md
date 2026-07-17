# Provider Actions Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/extension-sdk/src/profile.ts`

```ts
export interface ProfileAction<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly effect: 'reversible' | 'irreversible'
  readonly input: TInput
  readonly output: ProfileReference
  readonly docs: string
  readonly examples?: readonly unknown[]
}
```

### `packages/extension-sdk/src/adapter.ts`

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

### `packages/extension-sdk/src/operations.ts`

```ts
export interface ActionContext<TInput = unknown> extends ProviderContext {
  readonly input: TInput
  readonly signal: AbortSignal
}
```

### `packages/core/src/action/describe.ts`

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

### `packages/core/src/action/run.ts`

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

### `packages/adapters/src/google-mailbox/draft.ts`

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

### `packages/adapters/src/microsoft/mailbox/draft.ts`

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

### `apps/cli/src/action/handle-action-command.ts`

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

### Message Action definition exports

```ts
export {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
  communicationMessageProfile,
}
```

## Implementation doctrine

Profiles own Action ids, input schemas, output Profile, effect, docs, and examples. Adapters bind implementations only for declared Actions. Core resolves the Source-bound binding, validates input before provider I/O, enforces effect confirmation, invokes one operation context, validates the returned Ref/Profile/payload, and stores complete ad-hoc output. Automatic 401 retry is disabled.

Gmail Draft identity uses the immutable Draft id; Outlook requests immutable Graph ids. Updates build complete replacement recipients, subject, and body. The CLI exposes only registry-derived `action describe` and `action run`; no provider-specific parallel command family or send route exists.

## Verification

SDK/registry tests cover declaration-binding consistency. Core and CLI tests cover resolution, validation, confirmation, output checks, and storage. Google/Microsoft Draft and no-send tests assert one mutation, stable identity, replacement semantics, and no retry/send affordance.
