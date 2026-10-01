import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AnyCatalogDefinition,
  AnyExtensionDefinition,
  ExtensionPackageTarget,
} from '@ctxindex/extension-sdk'
import {
  createExtensionHostDiagnostic,
  safeExtensionDiagnostic,
} from '../extension/diagnostics'
import {
  assertCompatibleExtensionDocumentation,
  resolveCollectedExtensionDocumentation,
} from '../extension/documentation'
import { importExtensionPackageRoot } from '../extension/import'
import {
  inspectPackageEntries,
  resolvePackageEntries,
  selectCatalogLiteral,
  selectExactCatalog,
} from '../extension/package-entry'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import {
  buildCompleteCandidateRegistry,
  type CollectedExtension,
  type ExtensionRegistry,
  type OAuthAppIdentity,
} from '../registry'
import type {
  ExactDependencyResolutionArtifact,
  MaterializedDirectExtension,
  PackageMaterializer,
} from './materializer'
import {
  type CatalogCurationLink,
  type CatalogSourceLocator,
  catalogCurationLinkSchema,
  catalogSourceLocatorSchema,
  type DirectExtensionInstallationRecord,
  type DirectExtensionInventoryEntry,
  type GenericExtensionInstallationRecord,
  projectDirectExtensionRecord,
} from './schema'
import {
  DirectExtensionRecordDurabilityError,
  type DirectExtensionStore,
} from './store'
import {
  type DirectExtensionTarget,
  parseDirectExtensionTarget,
  sanitizeDirectExtensionTarget,
  validateDirectExtensionId,
  validateDirectPackageTarget,
} from './target'

export interface DirectExtensionSourceBinding {
  readonly id: string
  readonly label: string
  readonly adapterId: string
}

export interface DirectExtensionUninstallResult {
  readonly extension: DirectExtensionInventoryEntry
  readonly blockingSources: readonly DirectExtensionSourceBinding[]
  readonly forced: boolean
  readonly dataPreserved: true
}

export type GenericExtensionUninstallResult = DirectExtensionUninstallResult

function lifecycleError(
  code:
    | 'extension_target_invalid'
    | 'extension_acquisition_failed'
    | 'extension_validation_failed'
    | 'extension_conflict'
    | 'extension_removal_blocked',
  message: string,
  extra: object = {},
): Error {
  const exitCode =
    code === 'extension_acquisition_failed'
      ? 30
      : code === 'extension_target_invalid' ||
          code === 'extension_removal_blocked'
        ? 2
        : 50
  return Object.assign(new Error(message), { code, exitCode, ...extra })
}

function runtimeRoots(
  registry: ExtensionRegistry,
  excludedId?: string,
): Array<{
  readonly definition: AnyExtensionDefinition
  readonly provenance: {
    readonly origin: 'builtin'
    readonly entry: string
    readonly exportName: 'default'
  }
}> {
  return registry
    .list()
    .filter((definition) => definition.id !== excludedId)
    .map((definition, index) => ({
      definition,
      provenance: {
        origin: 'builtin' as const,
        entry: `runtime:${index}`,
        exportName: 'default' as const,
      },
    }))
}

function activeRoots(
  registry: ExtensionRegistry,
  roots: readonly CollectedExtension[] | undefined,
): readonly CollectedExtension[] {
  return roots ?? runtimeRoots(registry)
}

function withoutDirectRoot(
  roots: readonly CollectedExtension[],
  extensionId: string,
): readonly CollectedExtension[] {
  return roots.filter(
    (root) =>
      root.definition.id !== extensionId || root.provenance.origin !== 'direct',
  )
}

function rootsWithoutPriorDirect(input: {
  readonly registry: ExtensionRegistry
  readonly roots?: readonly CollectedExtension[]
  readonly extensionId: string
  readonly alternateOriginAvailable: boolean
}): readonly CollectedExtension[] {
  return input.roots === undefined
    ? runtimeRoots(
        input.registry,
        input.alternateOriginAvailable ? undefined : input.extensionId,
      )
    : withoutDirectRoot(input.roots, input.extensionId)
}

function directTargetContext(
  extensionId: string,
  target: DirectExtensionTarget,
): string {
  const safe = sanitizeDirectExtensionTarget(target)
  return `Direct Extension ${extensionId} from ${safe.kind} ${safe.requestedTarget}`
}

function targetFromRecord(
  record: DirectExtensionInstallationRecord,
): DirectExtensionTarget {
  if (record.source.kind === 'local') {
    if (
      record.curation !== undefined ||
      record.source.origin_path === undefined
    ) {
      throw lifecycleError(
        'extension_target_invalid',
        `Extension ${record.id} is not a directly updateable local installation`,
      )
    }
    return {
      kind: 'local',
      requestedTarget: record.source.requested_target,
      originPath: record.source.origin_path,
    }
  }
  return {
    kind: record.source.kind,
    requestedTarget: record.source.requested_target,
  }
}

export interface CatalogCurationProvenanceInput {
  readonly extensionId: string
  readonly catalogName: string
  readonly catalogId: string
  readonly repository: string
  readonly commit: string
  readonly snapshotAcquiredAt: number
  readonly sourceLocator: CatalogSourceLocator
}

export type ExtensionPackageInstallSelection = {
  readonly kind: 'extension'
  readonly extensionId: string
}

export type ExactExtensionInstallSelection =
  | ExtensionPackageInstallSelection
  | {
      readonly kind: 'catalog-entry'
      readonly module: string
      readonly catalogId: string
      readonly entryIndex: number
      readonly extensionId: string
    }

export type ExtensionPackageAuthoringSelection =
  | Extract<ExtensionPackageInstallSelection, { readonly kind: 'extension' }>
  | {
      readonly kind: 'catalog'
      readonly module: string
      readonly catalogId?: string
    }

export interface ResolvedExtensionProvenance {
  readonly source:
    | {
        readonly kind: 'npm'
        readonly requestedTarget: string
        readonly package: string
        readonly version: string
        readonly integrity: string
      }
    | {
        readonly kind: 'git'
        readonly requestedTarget: string
        readonly repository: string
        readonly commit: string
      }
    | {
        readonly kind: 'local'
        readonly requestedTarget: string
        readonly path: string
        readonly contentDigest: string
      }
  readonly packageRoot: string
  readonly materializationDigest: string
}

export interface ResolvedExtensionCandidate {
  readonly kind: 'extension'
  readonly extensionId: string
  readonly selection: ExtensionPackageInstallSelection
  readonly selectedRoot: AnyExtensionDefinition
  readonly replay: ResolvedExtensionProvenance
  readonly dependencyResolutionArtifact: ExactDependencyResolutionArtifact
  dispose(): Promise<void>
}

export interface ResolvedCatalogAuthoringCandidate {
  readonly kind: 'catalog'
  readonly selection: Readonly<{
    kind: 'catalog'
    module: string
    catalogId: string
  }>
  readonly selectedRoot: AnyCatalogDefinition
  readonly replay: ResolvedExtensionProvenance
  readonly dependencyResolutionArtifact: ExactDependencyResolutionArtifact
  dispose(): Promise<void>
}

export type ResolvedAuthoringCandidate =
  | ResolvedExtensionCandidate
  | ResolvedCatalogAuthoringCandidate

export interface ExactExtensionInstallCandidate {
  readonly replay: ResolvedExtensionProvenance & {
    readonly lock: Readonly<{
      readonly format: ExactDependencyResolutionArtifact['format']
      readonly path: string
      readonly digest: string
      readonly byteLength: number
    }>
  }
  readonly lockBytes: Uint8Array
  readonly immutableSnapshotRoot: string
  readonly selection: ExactExtensionInstallSelection
}

function exactReplaySource(input: {
  readonly materialized: MaterializedDirectExtension
  readonly containedLocalTarget?: string
}): ResolvedExtensionProvenance['source'] {
  const source = input.materialized.source
  if (source.kind === 'local') {
    return {
      kind: 'local',
      requestedTarget: input.containedLocalTarget as string,
      path: input.containedLocalTarget as string,
      contentDigest: source.content_digest,
    }
  }
  if (source.kind === 'git') {
    return {
      kind: 'git',
      requestedTarget: source.requested_target,
      repository: source.repository,
      commit: source.commit,
    }
  }
  if (source.integrity === undefined) {
    throw lifecycleError(
      'extension_validation_failed',
      'Exact npm package resolution has no integrity',
    )
  }
  return {
    kind: 'npm',
    requestedTarget: source.requested_target,
    package: source.package,
    version: source.exact_version,
    integrity: source.integrity,
  }
}

function installationSource(
  source: ResolvedExtensionProvenance['source'],
): DirectExtensionInstallationRecord['source'] {
  if (source.kind === 'npm') {
    return {
      kind: 'npm',
      requested_target: source.requestedTarget,
      package: source.package,
      exact_version: source.version,
      integrity: source.integrity,
    }
  }
  if (source.kind === 'git') {
    return {
      kind: 'git',
      requested_target: source.requestedTarget,
      repository: source.repository,
      commit: source.commit,
    }
  }
  return {
    kind: 'local',
    requested_target: source.requestedTarget,
    content_digest: source.contentDigest,
  }
}

function idempotentCleanup(cleanup: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined
  return () => (pending ??= cleanup())
}

async function containedSnapshotPackageRoot(
  snapshotRoot: string,
  packagePath: string,
): Promise<string> {
  const [root, candidate] = await Promise.all([
    realpath(snapshotRoot),
    realpath(resolve(snapshotRoot, packagePath)),
  ])
  const fromRoot = relative(root, candidate)
  if (
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw lifecycleError(
      'extension_validation_failed',
      'Exact local replay package escapes the immutable snapshot',
    )
  }
  return candidate
}

function curationLink(
  input: CatalogCurationProvenanceInput | undefined,
  materializationDigest: string,
): CatalogCurationLink | undefined {
  if (input === undefined) return undefined
  return {
    extension_id: input.extensionId,
    catalog_name: input.catalogName,
    catalog_id: input.catalogId,
    repository: input.repository,
    commit: input.commit,
    snapshot_acquired_at: input.snapshotAcquiredAt,
    source_locator: input.sourceLocator,
    execution_materialization_digest: materializationDigest,
  }
}

function sameCatalog(
  record: DirectExtensionInstallationRecord,
  curation: CatalogCurationProvenanceInput,
): boolean {
  return (
    record.curation?.catalog_name === curation.catalogName &&
    record.curation.catalog_id === curation.catalogId
  )
}

async function selectMaterializedRoot(input: {
  readonly materialized: MaterializedDirectExtension
  readonly selection: ExactExtensionInstallSelection
}): Promise<CollectedExtension> {
  const packageRoot = join(
    input.materialized.stagingRoot,
    input.materialized.packageRoot,
  )
  if (input.selection.kind === 'extension') {
    return importExtensionPackageRoot(
      packageRoot,
      input.selection.extensionId,
      { origin: 'direct' },
    )
  }
  const manifest = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  )
  const resolvedEntries = await resolvePackageEntries(packageRoot, manifest, {
    origin: 'direct',
  })
  const catalog = selectExactCatalog(
    await inspectPackageEntries(resolvedEntries),
    input.selection.catalogId,
  )
  if (
    (await realpath(resolve(packageRoot, input.selection.module))) !==
    (await realpath(catalog.modulePath))
  ) {
    throw createExtensionHostDiagnostic(
      'Catalog literal module does not match exact locator',
    )
  }
  const definition = selectCatalogLiteral(
    catalog.definition,
    input.selection.entryIndex,
    input.selection.extensionId,
  )
  return resolveCollectedExtensionDocumentation(
    {
      definition,
      provenance: {
        origin: 'direct',
        entry: catalog.modulePath,
        exportName: 'default',
      },
    },
    pathToFileURL(catalog.modulePath),
  )
}

async function selectMaterializedCatalog(input: {
  readonly materialized: MaterializedDirectExtension
  readonly replay: ResolvedExtensionProvenance
  readonly selection: Extract<
    ExtensionPackageAuthoringSelection,
    { readonly kind: 'catalog' }
  >
  readonly dispose: () => Promise<void>
}): Promise<ResolvedCatalogAuthoringCandidate> {
  const packageRoot = join(
    input.materialized.stagingRoot,
    input.materialized.packageRoot,
  )
  const manifest = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  )
  const resolvedEntries = await resolvePackageEntries(packageRoot, manifest, {
    origin: 'direct',
  })
  const inspected = await inspectPackageEntries(resolvedEntries)
  const selected =
    input.selection.catalogId === undefined
      ? (() => {
          const catalogs = inspected.filter(
            (
              root,
            ): root is Extract<
              (typeof inspected)[number],
              { readonly definition: AnyCatalogDefinition }
            > => root.definition.kind === 'catalog',
          )
          if (catalogs.length === 0)
            throw createExtensionHostDiagnostic('Package exports no Catalog')
          if (catalogs.length > 1)
            throw createExtensionHostDiagnostic(
              'Package exports multiple Catalogs; select one exact Catalog id',
            )
          return catalogs[0] as (typeof catalogs)[number]
        })()
      : selectExactCatalog(inspected, input.selection.catalogId)
  if (
    (await realpath(resolve(packageRoot, input.selection.module))) !==
    (await realpath(selected.modulePath))
  ) {
    throw createExtensionHostDiagnostic(
      'Catalog module does not match exact locator',
    )
  }
  const literalRoots = await Promise.all(
    selected.definition.extensions
      .filter(
        (definition): definition is AnyExtensionDefinition =>
          definition.kind === 'extension',
      )
      .map((definition) =>
        resolveCollectedExtensionDocumentation(
          {
            definition,
            provenance: {
              origin: 'direct',
              entry: selected.modulePath,
              exportName: 'default',
            },
          },
          pathToFileURL(selected.modulePath),
        ),
      ),
  )
  assertCompatibleExtensionDocumentation(literalRoots)
  buildCompleteCandidateRegistry({
    roots: literalRoots,
    localOAuthAppIdentities: [],
  })
  return {
    kind: 'catalog',
    selection: {
      kind: 'catalog',
      module: input.selection.module,
      catalogId: selected.definition.id,
    },
    selectedRoot: selected.definition,
    replay: input.replay,
    dependencyResolutionArtifact:
      input.materialized.dependencyResolutionArtifact,
    dispose: input.dispose,
  }
}

async function publishValidatedCandidate(input: {
  readonly store: DirectExtensionStore
  readonly now: () => number
  readonly targetContext: string
  readonly extensionId: string
  readonly selection?: ExactExtensionInstallSelection
  readonly registry: ExtensionRegistry
  readonly roots?: readonly CollectedExtension[]
  readonly localOAuthAppIdentities: readonly OAuthAppIdentity[]
  readonly current: readonly DirectExtensionInstallationRecord[]
  readonly previous?: DirectExtensionInstallationRecord
  readonly alternateOriginAvailable?: boolean
  readonly materialized: MaterializedDirectExtension
  readonly selected?: CollectedExtension
  readonly recordSource?: DirectExtensionInstallationRecord['source']
  readonly curation?: CatalogCurationProvenanceInput
}): Promise<GenericExtensionInstallationRecord> {
  const { materialized } = input
  let committed = false
  try {
    const selected =
      input.selected ??
      (await (async () => {
        try {
          return await selectMaterializedRoot({
            materialized,
            selection: input.selection ?? {
              kind: 'extension',
              extensionId: input.extensionId,
            },
          })
        } catch (cause) {
          throw lifecycleError(
            'extension_validation_failed',
            `${input.targetContext}: ${safeExtensionDiagnostic(cause, 'package validation failed')}`,
          )
        }
      })())
    try {
      const nextRoots = [
        ...(input.previous === undefined
          ? activeRoots(input.registry, input.roots)
          : rootsWithoutPriorDirect({
              registry: input.registry,
              ...(input.roots === undefined ? {} : { roots: input.roots }),
              extensionId: input.previous.id,
              alternateOriginAvailable: input.alternateOriginAvailable === true,
            })),
        selected,
      ]
      assertCompatibleExtensionDocumentation(nextRoots)
      buildCompleteCandidateRegistry({
        roots: nextRoots,
        localOAuthAppIdentities: input.localOAuthAppIdentities,
      })
    } catch (cause) {
      throw lifecycleError(
        'extension_conflict',
        `${input.targetContext}: ${safeExtensionDiagnostic(cause, 'complete registry conflict')}`,
      )
    }
    const linkedCuration = curationLink(
      input.curation,
      materialized.materializationDigest,
    )
    const dependencyResolution = {
      format: materialized.dependencyResolutionArtifact.format,
      digest: materialized.dependencyResolutionArtifact.digest,
    } as const
    const semanticRecord = {
      source: input.recordSource ?? materialized.source,
      dependency_resolution: dependencyResolution,
      materialization_digest: materialized.materializationDigest,
      package_root: materialized.packageRoot,
      ...(linkedCuration === undefined ? {} : { curation: linkedCuration }),
    }
    if (
      input.previous !== undefined &&
      JSON.stringify({
        source: input.previous.source,
        dependency_resolution: input.previous.dependency_resolution,
        materialization_digest: input.previous.materialization_digest,
        package_root: input.previous.package_root,
        ...(input.previous.curation === undefined
          ? {}
          : { curation: input.previous.curation }),
      }) === JSON.stringify(semanticRecord)
    ) {
      return input.previous
    }
    const now = input.now()
    const record: GenericExtensionInstallationRecord = {
      id: input.extensionId,
      ...semanticRecord,
      installed_at: input.previous?.installed_at ?? now,
      updated_at: now,
    }
    await input.store.publishMaterialization(
      materialized.stagingRoot,
      materialized.materializationDigest,
    )
    try {
      const publication = await input.store.writeRecords([
        ...input.current.filter(
          (candidate) => candidate.id !== input.extensionId,
        ),
        record,
      ])
      committed = true
      if (publication.recordDirectoryDurability === 'unsupported') {
        return record
      }
    } catch (cause) {
      if (cause instanceof DirectExtensionRecordDurabilityError) {
        committed = true
      } else {
        await input.store
          .discardMaterializationIfUnreferenced(
            materialized.materializationDigest,
          )
          .catch(() => undefined)
      }
      throw cause
    }
    await input.store
      .collectUnreferencedMaterializations()
      .catch(() => undefined)
    return record
  } finally {
    if (committed) await materialized.cleanup().catch(() => undefined)
    else await materialized.cleanup()
  }
}

export interface DirectExtensionServiceOptions {
  readonly store: DirectExtensionStore
  readonly materializer: PackageMaterializer
  readonly now?: () => number
}

export interface DirectExtensionValidationContext {
  readonly registry: ExtensionRegistry
  readonly roots?: readonly CollectedExtension[]
  readonly localOAuthAppIdentities: readonly OAuthAppIdentity[]
  readonly alternateOriginAvailable?: boolean
}

export interface DirectExtensionUninstallContext
  extends DirectExtensionValidationContext {
  readonly sources: readonly DirectExtensionSourceBinding[]
}

export interface GenericExtensionPackageInstallerOptions {
  readonly store: DirectExtensionStore
  readonly materializer: PackageMaterializer
  readonly loadActiveState: () => Promise<DirectExtensionValidationContext>
  readonly now?: () => number
}

export class GenericExtensionPackageInstaller {
  readonly store: DirectExtensionStore
  readonly materializer: PackageMaterializer
  readonly loadActiveState: () => Promise<DirectExtensionValidationContext>
  readonly now: () => number

  constructor(options: GenericExtensionPackageInstallerOptions) {
    this.store = options.store
    this.materializer = options.materializer
    this.loadActiveState = options.loadActiveState
    this.now = options.now ?? Date.now
  }

  async resolveForAuthoring(input: {
    readonly target: ExtensionPackageTarget
    readonly selection: ExtensionPackageAuthoringSelection
    readonly immutableBaseRoot: string
    readonly signal?: AbortSignal
  }): Promise<ResolvedAuthoringCandidate> {
    if (input.selection.kind === 'extension')
      validateDirectExtensionId(input.selection.extensionId)
    const target = parseDirectExtensionTarget(
      input.target.kind,
      input.target.target,
      {
        cwd: input.immutableBaseRoot,
        validatePackageTarget: validateDirectPackageTarget,
      },
    )
    let containedLocalTarget: string | undefined
    if (target.kind === 'local') {
      const [baseRoot, localRoot] = await Promise.all([
        realpath(input.immutableBaseRoot),
        realpath(target.originPath),
      ])
      const fromBase = relative(baseRoot, localRoot)
      if (
        fromBase === '..' ||
        fromBase.startsWith(`..${sep}`) ||
        isAbsolute(fromBase)
      ) {
        throw lifecycleError(
          'extension_target_invalid',
          'Local authoring target escapes the Catalog package root',
        )
      }
      containedLocalTarget =
        fromBase === '' ? '.' : fromBase.split(sep).join('/')
    }
    let materialized: MaterializedDirectExtension
    try {
      materialized = await this.materializer.materialize(target, {
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(target.kind === 'local' && input.selection.kind === 'catalog'
          ? { excludeCatalogSnapshotMetadata: true }
          : {}),
      })
    } catch (cause) {
      if ((cause as { code?: unknown }).code === 'cancelled') throw cause
      throw lifecycleError(
        'extension_acquisition_failed',
        `${input.selection.kind === 'catalog' ? `Catalog ${input.selection.catalogId ?? 'authoring selection'}` : `Extension ${input.selection.extensionId}`}: ${safeExtensionDiagnostic(cause, 'package acquisition failed')}`,
      )
    }
    const dispose = idempotentCleanup(materialized.cleanup)
    try {
      const replay: ResolvedExtensionProvenance = {
        source: exactReplaySource({
          materialized,
          ...(containedLocalTarget === undefined
            ? {}
            : { containedLocalTarget }),
        }),
        packageRoot: materialized.packageRoot,
        materializationDigest: materialized.materializationDigest,
      }
      if (input.selection.kind === 'catalog') {
        return await selectMaterializedCatalog({
          materialized,
          replay,
          selection: input.selection,
          dispose,
        })
      }
      const selected = await selectMaterializedRoot({
        materialized,
        selection: input.selection,
      })
      assertCompatibleExtensionDocumentation([selected])
      buildCompleteCandidateRegistry({
        roots: [selected],
        localOAuthAppIdentities: [],
      })
      return {
        kind: 'extension',
        extensionId: input.selection.extensionId,
        selection: input.selection,
        selectedRoot: selected.definition,
        replay,
        dependencyResolutionArtifact: materialized.dependencyResolutionArtifact,
        dispose,
      }
    } catch (cause) {
      await dispose().catch(() => undefined)
      throw lifecycleError(
        'extension_validation_failed',
        `${input.selection.kind === 'catalog' ? `Catalog ${input.selection.catalogId ?? 'authoring selection'}` : `Extension ${input.selection.extensionId}`}: ${safeExtensionDiagnostic(cause, 'package validation failed')}`,
      )
    }
  }

  async installDirect(input: {
    readonly target: DirectExtensionTarget
    readonly extensionId: string
    readonly signal?: AbortSignal
  }): Promise<DirectExtensionInstallationRecord> {
    validateDirectExtensionId(input.extensionId)
    if (
      (await this.store.readRecords()).some(
        (record) => record.id === input.extensionId,
      )
    ) {
      throw lifecycleError(
        'extension_target_invalid',
        `Direct Extension ${input.extensionId} is already installed; use extension update ${input.extensionId}`,
      )
    }
    const staged = await this.stageDirectCandidate({
      target: input.target,
      extensionId: input.extensionId,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
    return this.commitDirectCandidate({
      ...staged,
      extensionId: input.extensionId,
    })
  }

  async updateDirect(input: {
    readonly extensionId: string
    readonly signal?: AbortSignal
  }): Promise<DirectExtensionInstallationRecord> {
    validateDirectExtensionId(input.extensionId)
    const expectedPrevious = (await this.store.readRecords()).find(
      (record) => record.id === input.extensionId,
    )
    if (expectedPrevious === undefined) {
      throw lifecycleError(
        'extension_target_invalid',
        `Direct Extension ${input.extensionId} is not installed`,
      )
    }
    if (expectedPrevious.curation !== undefined) {
      throw lifecycleError(
        'extension_target_invalid',
        `Extension ${input.extensionId} is Catalog-curated; use extension update ${input.extensionId}`,
      )
    }
    const target = targetFromRecord(expectedPrevious)
    const staged = await this.stageDirectCandidate({
      target,
      extensionId: input.extensionId,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
    return this.commitDirectCandidate({
      ...staged,
      extensionId: input.extensionId,
      expectedPrevious,
      target,
    })
  }

  private async stageDirectCandidate(input: {
    readonly target: DirectExtensionTarget
    readonly extensionId: string
    readonly signal?: AbortSignal
  }): Promise<{
    readonly targetContext: string
    readonly materialized: MaterializedDirectExtension
    readonly selected: CollectedExtension
  }> {
    const targetContext = directTargetContext(input.extensionId, input.target)
    let materialized: MaterializedDirectExtension
    try {
      materialized = await this.materializer.materialize(input.target, {
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
    } catch (cause) {
      if ((cause as { code?: unknown }).code === 'cancelled') throw cause
      throw lifecycleError(
        'extension_acquisition_failed',
        `${targetContext}: ${safeExtensionDiagnostic(cause, 'package acquisition failed')}`,
      )
    }
    try {
      const selected = await selectMaterializedRoot({
        materialized,
        selection: { kind: 'extension', extensionId: input.extensionId },
      })
      assertCompatibleExtensionDocumentation([selected])
      buildCompleteCandidateRegistry({
        roots: [selected],
        localOAuthAppIdentities: [],
      })
      return { targetContext, materialized, selected }
    } catch (cause) {
      await materialized.cleanup().catch(() => undefined)
      throw lifecycleError(
        'extension_validation_failed',
        `${targetContext}: ${safeExtensionDiagnostic(cause, 'package validation failed')}`,
      )
    }
  }

  private async commitDirectCandidate(input: {
    readonly extensionId: string
    readonly targetContext: string
    readonly materialized: MaterializedDirectExtension
    readonly selected: CollectedExtension
    readonly expectedPrevious?: DirectExtensionInstallationRecord
    readonly target?: DirectExtensionTarget
  }): Promise<DirectExtensionInstallationRecord> {
    let publicationOwnsCleanup = false
    try {
      return await this.store.withLifecycleLock(async () => {
        const current = await this.store.readRecords()
        const previous = current.find(
          (record) => record.id === input.extensionId,
        )
        if (input.expectedPrevious === undefined) {
          if (previous !== undefined) {
            throw lifecycleError(
              'extension_target_invalid',
              `Direct Extension ${input.extensionId} is already installed; use extension update ${input.extensionId}`,
            )
          }
        } else {
          if (previous === undefined) {
            throw lifecycleError(
              'extension_target_invalid',
              `Direct Extension ${input.extensionId} is not installed`,
            )
          }
          if (previous.curation !== undefined) {
            throw lifecycleError(
              'extension_target_invalid',
              `Extension ${input.extensionId} is Catalog-curated; retry extension update ${input.extensionId}`,
            )
          }
          if (
            JSON.stringify(targetFromRecord(previous)) !==
            JSON.stringify(input.target)
          ) {
            throw lifecycleError(
              'extension_conflict',
              `Direct Extension ${input.extensionId} changed during update; retry`,
            )
          }
        }
        const validation = await this.loadActiveState()
        publicationOwnsCleanup = true
        return publishValidatedCandidate({
          store: this.store,
          now: this.now,
          targetContext: input.targetContext,
          extensionId: input.extensionId,
          registry: validation.registry,
          ...(validation.roots === undefined
            ? {}
            : { roots: validation.roots }),
          localOAuthAppIdentities: validation.localOAuthAppIdentities,
          current,
          ...(previous === undefined ? {} : { previous }),
          alternateOriginAvailable:
            validation.alternateOriginAvailable === true,
          materialized: input.materialized,
          selected: input.selected,
        })
      })
    } catch (cause) {
      if (!publicationOwnsCleanup)
        await input.materialized.cleanup().catch(() => undefined)
      throw cause
    }
  }

  async installExact(
    input: ExactExtensionInstallCandidate & {
      readonly curation?: CatalogCurationProvenanceInput
      readonly expectedPrevious?: GenericExtensionInstallationRecord
      readonly validatePreCommit?: () => Promise<void>
      readonly signal?: AbortSignal
    },
  ): Promise<GenericExtensionInstallationRecord> {
    const extensionId = input.selection.extensionId
    validateDirectExtensionId(extensionId)
    try {
      if (input.selection.kind === 'catalog-entry') {
        catalogSourceLocatorSchema.parse({
          kind: 'literal',
          module: input.selection.module,
          catalogId: input.selection.catalogId,
          entryIndex: input.selection.entryIndex,
          extensionId: input.selection.extensionId,
        })
      }
      if (input.curation !== undefined) {
        catalogCurationLinkSchema.parse(
          curationLink(input.curation, input.replay.materializationDigest),
        )
      }
    } catch (cause) {
      throw lifecycleError(
        'extension_target_invalid',
        `Catalog curation or exact selection is invalid: ${safeExtensionDiagnostic(cause, 'invalid locator')}`,
      )
    }
    if (
      input.curation !== undefined &&
      (input.curation.extensionId !== extensionId ||
        !Number.isSafeInteger(input.curation.sourceLocator.entryIndex) ||
        input.curation.sourceLocator.entryIndex < 0 ||
        input.curation.sourceLocator.entryIndex > 255 ||
        (input.curation.sourceLocator.kind === 'package' &&
          input.selection.kind !== 'extension') ||
        (input.curation.sourceLocator.kind === 'literal' &&
          (input.curation.sourceLocator.extensionId !== extensionId ||
            input.selection.kind !== 'catalog-entry' ||
            input.curation.sourceLocator.module !== input.selection.module ||
            input.curation.sourceLocator.catalogId !==
              input.selection.catalogId ||
            input.curation.sourceLocator.entryIndex !==
              input.selection.entryIndex)))
    ) {
      throw lifecycleError(
        'extension_target_invalid',
        'Catalog curation source locator does not match exact installation',
      )
    }
    const dependencyResolutionArtifact: ExactDependencyResolutionArtifact = {
      format: input.replay.lock.format,
      digest: input.replay.lock.digest,
      bytes: input.lockBytes,
    }
    if (
      input.lockBytes.byteLength !== input.replay.lock.byteLength ||
      (input.replay.source.kind === 'npm' &&
        input.replay.source.integrity.length === 0)
    ) {
      throw lifecycleError(
        'extension_validation_failed',
        'Exact package provenance does not match its dependency resolution artifact',
      )
    }
    let localPackageRoot: string | undefined
    try {
      localPackageRoot =
        input.replay.source.kind === 'local'
          ? await containedSnapshotPackageRoot(
              input.immutableSnapshotRoot,
              input.replay.source.path,
            )
          : undefined
    } catch (cause) {
      if ((cause as { code?: unknown }).code === 'extension_validation_failed')
        throw cause
      throw lifecycleError(
        'extension_validation_failed',
        `Extension ${extensionId}: ${safeExtensionDiagnostic(cause, 'immutable snapshot package is unavailable')}`,
      )
    }
    let materialized: MaterializedDirectExtension
    try {
      materialized = await this.materializer.materializeExact(
        {
          source: installationSource(input.replay.source),
          packageRoot: input.replay.packageRoot,
          materializationDigest: input.replay.materializationDigest,
          dependencyResolutionArtifact,
          ...(localPackageRoot === undefined ? {} : { localPackageRoot }),
          ...(input.replay.source.kind === 'local' &&
          input.selection.kind === 'catalog-entry'
            ? { excludeCatalogSnapshotMetadata: true }
            : {}),
        },
        input.signal === undefined ? {} : { signal: input.signal },
      )
    } catch (cause) {
      if ((cause as { code?: unknown }).code === 'cancelled') throw cause
      throw lifecycleError(
        'extension_acquisition_failed',
        `Extension ${extensionId}: ${safeExtensionDiagnostic(cause, 'exact package replay failed')}`,
      )
    }
    let selected: CollectedExtension
    try {
      selected = await selectMaterializedRoot({
        materialized,
        selection: input.selection,
      })
      assertCompatibleExtensionDocumentation([selected])
      buildCompleteCandidateRegistry({
        roots: [selected],
        localOAuthAppIdentities: [],
      })
    } catch (cause) {
      await materialized.cleanup().catch(() => undefined)
      throw lifecycleError(
        'extension_validation_failed',
        `Extension ${extensionId}: ${safeExtensionDiagnostic(cause, 'exact replay package validation failed')}`,
      )
    }
    let publicationOwnsCleanup = false
    try {
      return await this.store.withLifecycleLock(async () => {
        const current = await this.store.readRecords()
        const previous = current.find((record) => record.id === extensionId)
        if (
          input.expectedPrevious !== undefined &&
          JSON.stringify(previous) !== JSON.stringify(input.expectedPrevious)
        ) {
          throw lifecycleError(
            'extension_conflict',
            `Extension ${extensionId} changed during update; retry`,
          )
        }
        if (
          previous !== undefined &&
          (input.curation === undefined ||
            !sameCatalog(previous, input.curation))
        ) {
          throw lifecycleError(
            'extension_conflict',
            `Extension ${extensionId} is already installed from another origin`,
          )
        }
        await input.validatePreCommit?.()
        const active = await this.loadActiveState()
        const roots =
          previous?.curation === undefined || active.roots === undefined
            ? active.roots
            : active.roots.filter(
                (root) =>
                  root.definition.id !== extensionId ||
                  root.provenance.origin !== 'catalog',
              )
        publicationOwnsCleanup = true
        return publishValidatedCandidate({
          store: this.store,
          now: this.now,
          targetContext: `Extension ${extensionId} exact replay`,
          extensionId,
          selection: input.selection,
          registry: active.registry,
          ...(roots === undefined ? {} : { roots }),
          localOAuthAppIdentities: active.localOAuthAppIdentities,
          current,
          ...(previous === undefined ? {} : { previous }),
          materialized,
          selected,
          recordSource: installationSource(input.replay.source),
          ...(input.curation === undefined ? {} : { curation: input.curation }),
        })
      })
    } catch (cause) {
      if (!publicationOwnsCleanup)
        await materialized.cleanup().catch(() => undefined)
      throw cause
    }
  }
}

export class DirectExtensionService {
  readonly store: DirectExtensionStore
  readonly materializer: PackageMaterializer
  readonly now: () => number

  constructor(options: DirectExtensionServiceOptions) {
    this.store = options.store
    this.materializer = options.materializer
    this.now = options.now ?? Date.now
  }

  async list(): Promise<readonly DirectExtensionInventoryEntry[]> {
    return (await this.store.readRecordsForLoading()).records.map(
      projectDirectExtensionRecord,
    )
  }

  async install(input: {
    readonly target: DirectExtensionTarget
    readonly extensionId: string
    readonly loadValidationContext: () => Promise<DirectExtensionValidationContext>
    readonly signal?: AbortSignal
  }): Promise<DirectExtensionInstallationRecord> {
    return new GenericExtensionPackageInstaller({
      store: this.store,
      materializer: this.materializer,
      loadActiveState: input.loadValidationContext,
      now: this.now,
    }).installDirect({
      target: input.target,
      extensionId: input.extensionId,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
  }

  async update(input: {
    readonly extensionId: string
    readonly loadValidationContext: () => Promise<DirectExtensionValidationContext>
    readonly signal?: AbortSignal
  }): Promise<DirectExtensionInstallationRecord> {
    return new GenericExtensionPackageInstaller({
      store: this.store,
      materializer: this.materializer,
      loadActiveState: input.loadValidationContext,
      now: this.now,
    }).updateDirect({
      extensionId: input.extensionId,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
  }

  async uninstall(input: {
    readonly extensionId: string
    readonly loadValidationContext: () => Promise<DirectExtensionUninstallContext>
    readonly force: boolean
  }): Promise<DirectExtensionUninstallResult> {
    validateDirectExtensionId(input.extensionId)
    return this.store.withLifecycleLock(async () => {
      const current = await this.store.readRecords()
      const installed = current.find(
        (record) => record.id === input.extensionId,
      )
      if (installed === undefined) {
        throw lifecycleError(
          'extension_target_invalid',
          `Direct Extension ${input.extensionId} is not installed`,
        )
      }
      const validation = await input.loadValidationContext()
      const installationLabel =
        installed.curation === undefined ? 'Direct Extension' : 'Extension'
      const removalRoots =
        installed.curation === undefined || validation.roots === undefined
          ? validation.roots
          : validation.roots.filter(
              (root) =>
                root.definition.id !== input.extensionId ||
                root.provenance.origin !== 'catalog',
            )
      const before = new Set(
        validation.registry.adapters.list().map((adapter) => adapter.id),
      )
      const postRemoval = buildCompleteCandidateRegistry({
        roots: rootsWithoutPriorDirect({
          registry: validation.registry,
          ...(removalRoots === undefined ? {} : { roots: removalRoots }),
          extensionId: input.extensionId,
          alternateOriginAvailable:
            validation.alternateOriginAvailable === true,
        }),
        localOAuthAppIdentities: validation.localOAuthAppIdentities,
      })
      const blockingSources = validation.sources
        .filter(
          (source) =>
            before.has(source.adapterId) &&
            !postRemoval.adapters.has(source.adapterId),
        )
        .sort(
          (left, right) =>
            compareUnicodeCodePoints(left.label, right.label) ||
            compareUnicodeCodePoints(left.id, right.id),
        )
      if (blockingSources.length > 0 && !input.force) {
        throw lifecycleError(
          'extension_removal_blocked',
          `${installationLabel} ${input.extensionId} is required by configured Sources: ${blockingSources.map(({ label }) => label).join(', ')}`,
          { blockingSources },
        )
      }
      const publication = await this.store.writeRecords(
        current.filter((record) => record.id !== input.extensionId),
      )
      if (publication.recordDirectoryDurability === 'synced') {
        await this.store
          .collectUnreferencedMaterializations()
          .catch(() => undefined)
      }
      return {
        extension: projectDirectExtensionRecord(installed),
        blockingSources,
        forced: input.force,
        dataPreserved: true,
      }
    })
  }
}
