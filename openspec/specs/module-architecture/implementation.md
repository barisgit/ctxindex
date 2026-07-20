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

### @ctxindex/extension-sdk — imported-value authoring boundary

```text
@ctxindex/extension-sdk
  z and core-independent plain-value factories/types
  Profile, Provider, OAuth App, Adapter, and Extension definitions
  direct auth.oauth2 and auth.none constructors
  pure Extension-root documentation descriptors and eager virtual trees
  no leaf docs, reference factories, dependency graph, host callback, or registration
```

Provider and Profile use sites accept exact imported values. Adapter types discriminate OAuth2 Provider-backed, `none` Provider-backed, and providerless shapes so Provider authorization, access, and egress fields are impossible on providerless Adapters.

Package manifests and ordinary imports own workspace, local, Git, and npm dependencies. `@ctxindex/profiles` is an ordinary library rather than a privileged or always-selected Extension.

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

The CLI composes services, parses arguments, formats output, and maps errors. It owns no provider HTTP, SQL, identity generation, or domain behavior. Core owns orchestration, persistence, the source-neutral `ctxindex.extensions` entry resolver, namespace/root and reachable-leaf collectors, conservative duplicate handling, complete-registry validation, and atomic activation. Providers own auth and OAuth App registration contracts; Profiles own provider-neutral validation and projections; Adapters own Provider access, transport, normalization, operations, and Actions; the SDK owns core-independent plain-value authoring contracts. Extension roots only compose imported values and may declare one documentation sidecar, while package tooling owns dependencies. Core resolves sidecars before registry activation and excludes them from definition equivalence. Built-in, explicit-path, and Catalog origins enter the same collector and activation boundary.

The repository is pre-alpha. Implementation starts from the fresh schema and adds no prototype compatibility or data migration path.

## Verification

Use Bun's colocated unit/integration/e2e tests. Storage tests create fresh sandboxes; provider tests use loopback-only authorized HTTP. `scripts/verify/architecture-lint.ts`, package-dependency checks, SDK inference fixtures, common-origin activation tests, documentation resolver/projection tests, and relocated compiled-host and CLI tests enforce this shape. Verification rejects leaf documentation, reference/dependency/host-callback surfaces, providerless authorization fields, origin-specific registration, and pre-validation registry mutation.
