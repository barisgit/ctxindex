# Module Architecture Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### Workspace package seams

```text
apps/cli
  entrypoint: apps/cli/bin/ctxindex.mjs
  public export: . -> ./src/main.ts
packages/core
  public exports: ., ./paths, ./config, ./logger, ./artifact, ./export,
                  ./auth, ./client, ./account, ./realm, ./source, ./secrets,
                  ./schema, ./storage, ./testing, ./net, ./registry,
                  ./extension, ./sync, ./search, ./thread, ./errors, ./ids,
                  ./ref, ./migrations, ./action
packages/extension-sdk
  public authoring types and definition factories
packages/profiles
  bundled provider-neutral Profile definitions
packages/adapters
  bundled provider implementations
```

### Composition and build entrypoints

```ts
// apps/cli/src/main.ts
export async function runCli(args: string[]): Promise<number>

// packages/core/src/storage/init.ts
export async function bootstrapDatabase(): Promise<void>

// packages/core/src/extension/loader.ts
export async function loadExtensions(
  input: LoadExtensionsInput,
): Promise<LoadExtensionsResult>
```

## Implementation doctrine

ctxindex is a Bun and TypeScript monorepo; Node is not a build target. Bun remains pinned through `packageManager` at 1.3.14. The distribution target is the CLI entrypoint compiled with `bun build --compile`; migration SQL is imported as text and bundled skills are embedded so relocated binaries retain both.

The CLI composes services, parses arguments, formats output, and maps errors. It owns no provider HTTP, SQL, identity generation, or domain behavior. Core owns orchestration and every SQLite table/migration; Profiles own provider-neutral validation and projections; Adapters own provider transport and normalization; the SDK owns public authoring contracts. Workspace dependencies point only toward those public lower seams.

The repository is pre-alpha. Implementation starts from the fresh schema and adds no prototype compatibility or data migration path.

## Verification

Use Bun's colocated unit/integration/e2e tests. Storage tests create fresh sandboxes; provider tests use loopback-only authorized HTTP. `scripts/verify/architecture-lint.ts`, package-dependency checks, and relocated compiled-host and CLI tests enforce this shape.
