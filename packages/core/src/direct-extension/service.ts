import { join } from 'node:path'
import type { AnyExtensionDefinition } from '@ctxindex/extension-sdk'
import {
  assertCompatibleExtensionDocumentation,
  importExtensionPackageRoot,
  safeExtensionDiagnostic,
} from '../extension'
import {
  buildCompleteCandidateRegistry,
  type CollectedExtension,
  type ExtensionRegistry,
  type OAuthAppIdentity,
} from '../registry'
import type { PackageMaterializer } from './materializer'
import {
  type DirectExtensionInstallationRecord,
  type DirectExtensionInventoryEntry,
  projectDirectExtensionRecord,
} from './schema'
import type { DirectExtensionStore } from './store'
import {
  type DirectExtensionTarget,
  sanitizeDirectExtensionTarget,
  validateDirectExtensionId,
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
    validateDirectExtensionId(input.extensionId)
    return this.store.withLifecycleLock(async () => {
      const current = await this.store.readRecords()
      if (current.some((record) => record.id === input.extensionId)) {
        throw lifecycleError(
          'extension_target_invalid',
          `Direct Extension ${input.extensionId} is already installed; use extensions update ${input.extensionId}`,
        )
      }
      const validation = await input.loadValidationContext()
      return this.acquireValidatePublish({
        target: input.target,
        extensionId: input.extensionId,
        ...validation,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        current,
      })
    })
  }

  async update(input: {
    readonly extensionId: string
    readonly loadValidationContext: () => Promise<DirectExtensionValidationContext>
    readonly signal?: AbortSignal
  }): Promise<DirectExtensionInstallationRecord> {
    validateDirectExtensionId(input.extensionId)
    return this.store.withLifecycleLock(async () => {
      const current = await this.store.readRecords()
      const previous = current.find((record) => record.id === input.extensionId)
      if (previous === undefined) {
        throw lifecycleError(
          'extension_target_invalid',
          `Direct Extension ${input.extensionId} is not installed`,
        )
      }
      const validation = await input.loadValidationContext()
      return this.acquireValidatePublish({
        target: targetFromRecord(previous),
        extensionId: input.extensionId,
        registry: validation.registry,
        ...(validation.roots === undefined ? {} : { roots: validation.roots }),
        localOAuthAppIdentities: validation.localOAuthAppIdentities,
        alternateOriginAvailable: validation.alternateOriginAvailable === true,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        current,
        previous,
      })
    })
  }

  private async acquireValidatePublish(input: {
    readonly target: DirectExtensionTarget
    readonly extensionId: string
    readonly registry: ExtensionRegistry
    readonly roots?: readonly CollectedExtension[]
    readonly localOAuthAppIdentities: readonly OAuthAppIdentity[]
    readonly current: readonly DirectExtensionInstallationRecord[]
    readonly previous?: DirectExtensionInstallationRecord
    readonly alternateOriginAvailable?: boolean
    readonly signal?: AbortSignal
  }): Promise<DirectExtensionInstallationRecord> {
    const targetContext = directTargetContext(input.extensionId, input.target)
    let materialized: Awaited<ReturnType<PackageMaterializer['materialize']>>
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
    let committed = false
    try {
      let selected: Awaited<ReturnType<typeof importExtensionPackageRoot>>
      try {
        selected = await importExtensionPackageRoot(
          join(materialized.stagingRoot, materialized.packageRoot),
          input.extensionId,
          {
            origin: 'direct',
            ...(materialized.source.kind === 'npm'
              ? {
                  packageVersion: materialized.source.exact_version,
                  ...(materialized.source.integrity === undefined
                    ? {}
                    : { integrity: materialized.source.integrity }),
                }
              : materialized.source.kind === 'git'
                ? { commit: materialized.source.commit }
                : {}),
          },
        )
      } catch (cause) {
        throw lifecycleError(
          'extension_validation_failed',
          `${targetContext}: ${safeExtensionDiagnostic(cause, 'package validation failed')}`,
        )
      }
      try {
        const nextRoots = [
          ...(input.previous === undefined
            ? activeRoots(input.registry, input.roots)
            : rootsWithoutPriorDirect({
                registry: input.registry,
                ...(input.roots === undefined ? {} : { roots: input.roots }),
                extensionId: input.previous.id,
                alternateOriginAvailable:
                  input.alternateOriginAvailable === true,
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
          `${targetContext}: ${safeExtensionDiagnostic(cause, 'complete registry conflict')}`,
        )
      }
      const now = this.now()
      if (
        input.previous !== undefined &&
        JSON.stringify({
          source: input.previous.source,
          materialization_digest: input.previous.materialization_digest,
          package_root: input.previous.package_root,
        }) ===
          JSON.stringify({
            source: materialized.source,
            materialization_digest: materialized.materializationDigest,
            package_root: materialized.packageRoot,
          })
      ) {
        return input.previous
      }
      const record: DirectExtensionInstallationRecord = {
        id: input.extensionId,
        source: materialized.source,
        materialization_digest: materialized.materializationDigest,
        package_root: materialized.packageRoot,
        installed_at: input.previous?.installed_at ?? now,
        updated_at: now,
      }
      await this.store.publishMaterialization(
        materialized.stagingRoot,
        materialized.materializationDigest,
      )
      try {
        await this.store.writeRecords([
          ...input.current.filter(
            (candidate) => candidate.id !== input.extensionId,
          ),
          record,
        ])
        committed = true
      } catch (cause) {
        await this.store
          .discardMaterializationIfUnreferenced(
            materialized.materializationDigest,
          )
          .catch(() => undefined)
        throw cause
      }
      await this.store
        .collectUnreferencedMaterializations()
        .catch(() => undefined)
      return record
    } finally {
      if (committed) await materialized.cleanup().catch(() => undefined)
      else await materialized.cleanup()
    }
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
      const before = new Set(
        validation.registry.adapters.list().map((adapter) => adapter.id),
      )
      const postRemoval = buildCompleteCandidateRegistry({
        roots: rootsWithoutPriorDirect({
          registry: validation.registry,
          ...(validation.roots === undefined
            ? {}
            : { roots: validation.roots }),
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
        .sort((left, right) => left.label.localeCompare(right.label))
      if (blockingSources.length > 0 && !input.force) {
        throw lifecycleError(
          'extension_removal_blocked',
          `Direct Extension ${input.extensionId} is required by configured Sources: ${blockingSources.map(({ label }) => label).join(', ')}`,
          { blockingSources },
        )
      }
      await this.store.writeRecords(
        current.filter((record) => record.id !== input.extensionId),
      )
      await this.store
        .collectUnreferencedMaterializations()
        .catch(() => undefined)
      return {
        extension: projectDirectExtensionRecord(installed),
        blockingSources,
        forced: input.force,
        dataPreserved: true,
      }
    })
  }
}
