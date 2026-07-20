# Extension Loading Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

### @ctxindex/core — package entry and root collection seams

```ts
export type DefinitionModule = Readonly<Record<string, unknown>>

export interface ResolvedPackageEntries {
  readonly entries: readonly string[]
  readonly provenance: Omit<DefinitionProvenance, 'entry' | 'exportName'>
}

export function resolvePackageEntries(
  packageRoot: string,
  packageJson: unknown,
  provenance: ResolvedPackageEntries['provenance'],
): Promise<ResolvedPackageEntries>;

export function collectExtensionExports(
  module: DefinitionModule,
  entry: string,
  provenance: ResolvedPackageEntries['provenance'],
): readonly CollectedExtension[];

export function selectExactExtension(
  collected: readonly CollectedExtension[],
  id: string,
): CollectedExtension;
```

`resolvePackageEntries` validates the ordered unique `package.json` `ctxindex.extensions` module paths, including containment after symlink resolution. Namespace collection inspects top-level values, structurally validates values claiming the Extension discriminator, ignores unrelated exports, and never invokes functions.

### @ctxindex/core — reachable graph and complete registry

```ts
export function collectExtensionGraph(
  root: AnyExtensionDefinition,
  provenance: DefinitionProvenance,
): CollectedExtensionGraph;

export function buildCompleteCandidateRegistry(
  input: CandidateRegistryInput,
): CompleteRegistry;
```

Traversal follows exact Provider/Profile values imported by Adapters and OAuth Apps and includes explicit standalone Provider/Profile leaves. Complete candidate validation is order-independent and atomic. OAuth App duplicates always conflict. Exact reused non-App objects may coalesce; distinct executable/schema-bearing same-identity values conflict; distinct pure declarative values coalesce only through canonical structural equality.

Built-in namespaces, explicit-path packages, and Catalog snapshots use these same seams. Acquisition and dependency materialization happen before this boundary and remain source-specific; core resolves no Extension dependency graph.

### Degraded loading

Absent or invalid Extension code leaves Sources unavailable for Provider operations while preserving stored Resource envelopes and payloads. Vocabulary needing an unavailable Profile reports degradation; no implicit foundational Profile Extension is synthesized.

## Implementation doctrine

Trusted entry modules use ordinary package imports and export shallow plain Extension values. The SDK exports factories and `z`; the host injects no authoring object and invokes no callback. Structural discriminators, not `instanceof` or physical SDK identity, identify candidates.

Root provenance is diagnostic only. Load order, origin priority, package version, integrity, path, object identity, and function text do not select duplicate winners. Complete candidate validation succeeds before active registry mutation.

Persistent direct local/Git/npm installation remains deferred. Existing explicit-path and Catalog acquisition delegate materialized roots and safe provenance to the common entry, collection, selection, and activation seams.

## Verification

Loader/registry tests cover multiple roots per module, malformed claimed roots, callback non-invocation, contained paths, transitive collection, standalone leaves, duplicate rules, cross-copy structural authoring, atomicity, Catalog delegation, and degraded data access. The relocated Bun 1.3.14 gate uses ordinary SDK imports, SDK-exported `z`, a relative TypeScript module, and a package-managed runtime dependency outside the repository.
