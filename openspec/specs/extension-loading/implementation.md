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

`importPackageEntries` also supplies each acquired entry's file URL to the shared documentation resolver. Whole-package import resolves every collected root. The exact-id seam collects all roots to prove unique selection, then resolves only the selected root's sidecar; invalid documentation on an unselected sibling cannot block an exact installed or direct import. The resolver binds an Extension-root `docs('./docs')` descriptor beside that entry, produces portable logical content, and removes the descriptor before complete-registry validation. Virtual built-in trees enter the same resolver. `LoadExtensionsResult.documentation` is built only from roots that survive atomic candidate validation.

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

Traversal follows exact Provider/Profile values imported by Adapters and OAuth Apps and includes explicit standalone Provider/Profile leaves. Complete candidate validation is order-independent and atomic. Its shared definition-id validator accepts at most 128 lowercase ASCII characters composed of alphanumeric segments separated by one `.`, `_`, or `-`, allowing authored and generated routes to use stable ids directly. OAuth App duplicates always conflict. Exact reused non-App objects may coalesce; distinct executable/schema-bearing same-identity values conflict; distinct pure declarative values coalesce only through canonical structural equality.

Built-in namespaces, explicit-path packages, Catalog snapshots, and immutable direct materializations use these same seams. Acquisition and dependency materialization happen before this boundary and remain source-specific; core resolves no Extension dependency graph.

### Degraded loading

Absent or invalid Extension code leaves Sources unavailable for Provider operations while preserving stored Resource envelopes and payloads. Vocabulary needing an unavailable Profile reports degradation; no implicit foundational Profile Extension is synthesized.

## Implementation doctrine

Trusted entry modules use ordinary package imports and export shallow plain Extension values. The SDK exports factories and `z`; the host injects no authoring object and invokes no callback. Structural discriminators, not `instanceof` or physical SDK identity, identify candidates. The relocated compiled gate installs the exact packed public SDK artifact into its external package and must not use workspace links, source-checkout resolution, or private host dependency injection.

Root provenance is retained as safe immutable acquisition evidence. A separate host release-policy matcher may consume it after duplicate-free activation solely to determine managed-App eligibility. Provenance, load order, origin priority, package version, integrity, path, object identity, and function text never establish leaf identity or equivalence and never select duplicate winners. Extension exports and package or Catalog manifests carry no authored managed authority. Complete candidate validation succeeds before active registry mutation.

Direct local/Git/npm installation delegates acquired roots and safe generic provenance to the common entry, collection, exact-selection, and activation seams. Strict direct records derive content-addressed package roots under the current data root. Startup verifies those pins and degrades only the invalid Extension without invoking Bun, Git, npm, or the original local path.

Persisted Extension paths are launch-directory independent. `readConfig`/`writeConfig` in `@ctxindex/core/config` resolve every relative `extensions.paths` entry against the configuration origin, the real (symlink-resolved) directory of the `config.toml` being read or written; writes persist that absolute form through the existing validated atomic rename, and reads never rewrite the file. `loadExtensions` accepts only absolute configured paths and reports a relative one as a bounded Extension diagnostic instead of resolving it against the process working directory. The CLI and a daemon started from any directory therefore load the same complete registry or the same bounded failure.

The daemon stages one complete registry candidate at startup and keeps it immutable for its lifetime; request handlers never mutate it in place. Installed-Extension changes reach the daemon only at a later start, which the direct maintenance coordinator in [local-daemon](../local-daemon/implementation.md#direct-maintenance-exclusion) provides by restarting a previously running daemon. Registry reads cross RPC as bounded value projections, never serialized definitions or functions.

The official providerless demo remains an external plain-value Extension rather than a built-in. Its authored source uses the public SDK, while its separately publishable package advertises one checked self-contained runnable entry so acquisition does not depend on unpublished workspace packages. That packaging concession does not bypass ordinary manifest containment, structural collection, exact-id selection, documentation resolution, complete-registry validation, or immutable direct provenance. npm publication and anonymous acquisition remain a Human checkpoint until the package exists publicly.

## Verification

Config and loader tests cover origin-relative projection through symlinked configuration homes and relative-path diagnostics; `apps/daemon/src/e2e/compiled-extension-registry.e2e.test.ts` starts the daemon from unrelated working directories and proves the same immutable registry plus restart-boundary activation that keeps the prior registry on failure. Loader/registry tests cover multiple roots per module, malformed claimed roots, callback non-invocation, contained paths, transitive collection, standalone leaves, duplicate rules, cross-copy structural authoring, atomicity, Catalog delegation, documentation resolution, and degraded data access. The relocated Bun 1.3.14 gate installs the exact packed SDK tarball and uses ordinary SDK imports, SDK-exported `z`, a relative TypeScript module, and a package-managed runtime dependency outside the repository. It proves loading without workspace links, host injection, checkout resolution, or physical SDK identity. Built-in documentation directories are resolved at package/build staging into `packages/official/src/generated/documentation.ts`; freshness tests compare source directories and embedded virtual trees through the same core resolver, and the relocated compiled-host gate reads that projection without checkout files.

The instant-demo gates additionally compare the generated entry byte-for-byte with its authored source build and run an isolated compiled-CLI workflow through Extension load, providerless Source creation, Sync, full-text and typed-field search, and complete `get`. Tests prohibit Adapter fetch use and assert exact synthetic fixture count, variety, stable references, typed projections, complete emissions, and checkpoint order.
