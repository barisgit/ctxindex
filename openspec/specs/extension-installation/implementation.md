# Direct Extension Installation Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

```ts
export type DirectExtensionSourceKind = 'npm' | 'git' | 'local'

export interface PackageMaterializer {
  materialize(
    target: DirectExtensionTarget,
    options?: { readonly signal?: AbortSignal },
  ): Promise<MaterializedDirectExtension>
}

export class DirectExtensionService {
  list(): Promise<readonly DirectExtensionInventoryEntry[]>
  install(input: DirectInstallInput): Promise<DirectExtensionInstallationRecord>
  update(input: DirectUpdateInput): Promise<DirectExtensionInstallationRecord>
  uninstall(input: DirectUninstallInput): Promise<DirectExtensionUninstallResult>
}
```

## Ownership and flow

`@ctxindex/core` owns target and record validation, generic provenance, immutable content-addressed materializations, lifecycle serialization, candidate validation, Source removal guards, and garbage collection. The Bun-backed materializer is injected behind `PackageMaterializer`; it receives executable-plus-argv process requests, resolves ordinary dependencies with lifecycle scripts disabled, and never resolves Extension dependencies.

Install and update acquire into same-filesystem staging, import and select one exact Extension root through the shared package boundary, validate the runtime-complete registry including local OAuth App identities, fsync and publish the immutable tree, then atomically replace the strict record document. Any failure before the record switch preserves the prior pin. Startup derives the managed path from the digest and has no materializer dependency.

Direct state is outside provider SQLite because Extension composition precedes database construction. Strict activation records live under the config root; runnable materializations live under the data root. Managed absolute paths are derived. Local origin paths are retained only as explicit update inputs, never as runtime load paths.

Uninstall computes Adapter availability without the selected direct root. Normal removal reports deterministic blocking Sources. Forced removal switches only activation state and garbage-collects unreferenced package bytes; Source-owned records and provider data are untouched.

## Verification

Focused tests cover explicit targets and credentials, strict records, deterministic directory digests, same-digest publication races, local dependency materialization, argv-only execution, exact npm/Git metadata projection, exact root selection, failed-update rollback, idempotent updates, offline pin loading, per-Extension degradation, Source guards, forced removal, CLI parsing, package boundaries, and stable exits. The relocated compiled gate remains the final proof that direct pins survive outside the checkout.
