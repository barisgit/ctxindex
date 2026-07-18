# Module Architecture Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### Workspace modules

```text
@ctxindex/cli
  executable composition root and command/output boundary
@ctxindex/core
  provider-neutral runtime services, persistence, orchestration, and registries
@ctxindex/extension-sdk
  public authoring contracts and generic definition factories
@ctxindex/profiles
  bundled provider-neutral Profile definitions
@ctxindex/adapters
  bundled provider implementations
```

### @ctxindex/extension-sdk — capability-gated Adapter contract

```ts
export type AdapterCapability =
  | 'sync'
  | 'search-remote'
  | 'retrieve'
  | 'download'

export type AdapterOperations = {
  readonly sync?: (context: SyncContext) => void | Promise<void>
  readonly searchRemote?: (
    context: SearchContext,
  ) => Promise<SearchRemoteResult>
  readonly retrieve?: (context: RetrieveContext) => void | Promise<void>
  readonly download?: (context: DownloadContext) => void | Promise<void>
}

export type AdapterOperationsFor<
  TCapabilities extends readonly AdapterCapability[],
> = CapabilityOperation<TCapabilities, 'sync', 'sync'> &
  CapabilityOperation<TCapabilities, 'search-remote', 'searchRemote'> &
  CapabilityOperation<TCapabilities, 'retrieve', 'retrieve'> &
  CapabilityOperation<TCapabilities, 'download', 'download'>

export interface AdapterDefinition<
  TId extends string = string,
  TVersion extends number = number,
  TConfigSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TCapabilities extends
    readonly AdapterCapability[] = readonly AdapterCapability[],
  TActions extends Readonly<Record<string, AdapterActionBinding>> = Readonly<
    Record<string, AdapterActionBinding>
  >,
  TAuth extends AdapterAuthSpec = AdapterAuthSpec,
> {
  readonly id: TId
  readonly version: TVersion
  readonly configSchema: TConfigSchema
  readonly auth: TAuth
  readonly providerApiHosts?: readonly string[]
  readonly profiles: readonly ProfileReference[]
  readonly routing: SearchRouting
  readonly capabilities: TCapabilities
  readonly operations: AdapterOperationsFor<TCapabilities>
  readonly actions: TActions
  readonly docs?: { readonly summary: string }
}

export function defineAdapter<
  const TId extends string,
  const TVersion extends number,
  TConfigSchema extends z.ZodTypeAny,
  const TCapabilities extends readonly AdapterCapability[],
  const TActions extends Readonly<Record<string, AdapterActionBinding>>,
  const TAuth extends AdapterAuthSpec,
>(
  definition: AdapterDefinition<
    TId,
    TVersion,
    TConfigSchema,
    TCapabilities,
    TActions,
    TAuth
  >,
): AdapterDefinition<
  TId,
  TVersion,
  TConfigSchema,
  TCapabilities,
  TActions,
  TAuth
>;
```

### @ctxindex/cli and @ctxindex/core — composition entrypoints

```ts
export async function runCli(args: string[]): Promise<number>;

export async function bootstrapDatabase(): Promise<void>;

export async function loadExtensions(
  input: LoadExtensionsInput,
): Promise<LoadExtensionsResult>;
```

## Implementation doctrine

ctxindex is a Bun and TypeScript monorepo; Node is not a build target. Bun remains pinned through `packageManager` at 1.3.14. The distribution target is the CLI entrypoint compiled with `bun build --compile`; migration SQL is imported as text and bundled skills are embedded so relocated binaries retain both.

The CLI composes services, parses arguments, formats output, and maps errors. It owns no provider HTTP, SQL, identity generation, or domain behavior. Core owns orchestration and every SQLite table/migration; Profiles own provider-neutral validation and projections; Adapters own provider transport and normalization; the SDK owns public authoring contracts. Workspace dependencies point only toward those public lower seams.

The repository is pre-alpha. Implementation starts from the fresh schema and adds no prototype compatibility or data migration path.

## Verification

Use Bun's colocated unit/integration/e2e tests. Storage tests create fresh sandboxes; provider tests use loopback-only authorized HTTP. `scripts/verify/architecture-lint.ts`, package-dependency checks, and relocated compiled-host and CLI tests enforce this shape.
