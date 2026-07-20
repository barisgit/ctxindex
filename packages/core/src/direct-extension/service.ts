import { join } from 'node:path'
import type { AnyExtensionDefinition } from '@ctxindex/extension-sdk'
import {
  importExtensionPackageRoot,
  safeExtensionDiagnostic,
} from '../extension'
import {
  buildCompleteCandidateRegistry,
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
import { type DirectExtensionTarget, validateDirectExtensionId } from './target'

export interface DirectExtensionSourceBinding {
  readonly id: string
  readonly label: string
  readonly adapterId: string
}

export interface DirectExtensionUninstallResult {
  readonly extension: DirectExtensionInventoryEntry
  readonly blockingSources: readonly DirectExtensionSourceBinding[]
}

function lifecycleError(
  code:
    | 'extension_target_invalid'
    | 'extension_validation_failed'
    | 'extension_conflict'
    | 'extension_removal_blocked',
  message: string,
  extra: object = {},
): Error {
  const exitCode =
    code === 'extension_target_invalid' || code === 'extension_removal_blocked'
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
    return (await this.store.readRecords()).map(projectDirectExtensionRecord)
  }

  async install(input: {
    readonly target: DirectExtensionTarget
    readonly extensionId: string
    readonly registry: ExtensionRegistry
    readonly localOAuthAppIdentities: readonly OAuthAppIdentity[]
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
      return this.acquireValidatePublish({ ...input, current })
    })
  }

  async update(input: {
    readonly extensionId: string
    readonly registry: ExtensionRegistry
    readonly localOAuthAppIdentities: readonly OAuthAppIdentity[]
    readonly alternateOriginAvailable: boolean
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
      return this.acquireValidatePublish({
        target: targetFromRecord(previous),
        extensionId: input.extensionId,
        registry: input.registry,
        localOAuthAppIdentities: input.localOAuthAppIdentities,
        alternateOriginAvailable: input.alternateOriginAvailable,
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
    readonly localOAuthAppIdentities: readonly OAuthAppIdentity[]
    readonly current: readonly DirectExtensionInstallationRecord[]
    readonly previous?: DirectExtensionInstallationRecord
    readonly alternateOriginAvailable?: boolean
    readonly signal?: AbortSignal
  }): Promise<DirectExtensionInstallationRecord> {
    const materialized = await this.materializer.materialize(input.target, {
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
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
          `Direct Extension ${input.extensionId}: ${safeExtensionDiagnostic(cause, 'package validation failed')}`,
        )
      }
      try {
        buildCompleteCandidateRegistry({
          roots: [
            ...runtimeRoots(
              input.registry,
              input.previous !== undefined &&
                input.alternateOriginAvailable !== true
                ? input.previous.id
                : undefined,
            ),
            selected,
          ],
          localOAuthAppIdentities: input.localOAuthAppIdentities,
        })
      } catch (cause) {
        throw lifecycleError(
          'extension_conflict',
          `Direct Extension ${input.extensionId}: ${safeExtensionDiagnostic(cause, 'complete registry conflict')}`,
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
    readonly registry: ExtensionRegistry
    readonly sources: readonly DirectExtensionSourceBinding[]
    readonly alternateOriginAvailable: boolean
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
      const before = new Set(
        input.registry.adapters.list().map((adapter) => adapter.id),
      )
      const postRemoval = buildCompleteCandidateRegistry({
        roots: runtimeRoots(
          input.registry,
          input.alternateOriginAvailable ? undefined : input.extensionId,
        ),
        localOAuthAppIdentities: [],
      })
      const blockingSources = input.sources
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
      }
    })
  }
}
