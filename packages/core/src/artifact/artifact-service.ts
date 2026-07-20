import type {
  ActionArtifact,
  ArtifactDescriptor,
  ResolvedArtifactDescriptor,
} from '@ctxindex/extension-sdk'
import type { AuthService } from '../auth'
import {
  CtxindexError,
  CtxindexNotFoundError,
  CtxindexValidationError,
} from '../errors'
import { parseRef } from '../ref'
import type { ExtensionRegistry } from '../registry'
import { ResourceStore, type StoredResource } from '../resource'
import {
  createSourceProviderContext,
  type SourceProviderFetch,
} from '../source/provider-context'
import type { CtxindexDatabase } from '../storage'
import {
  type Artifact,
  type ArtifactPurgeResult,
  ArtifactStore,
} from './artifact-store'

export interface ArtifactWarning {
  readonly code: string
  readonly message: string
  readonly ref: string
}

export interface ArtifactListResult {
  readonly resourceRef: string
  readonly artifacts: readonly ArtifactDescriptor[]
  readonly warnings: readonly ArtifactWarning[]
}

export type DownloadedArtifact = Omit<Artifact, 'localPath'>

export interface ArtifactDownloadResult {
  readonly artifact: DownloadedArtifact
  readonly cache: 'hit' | 'miss'
  readonly outputPath?: string | undefined
}

export interface ArtifactServiceInput {
  readonly db: CtxindexDatabase
  readonly registry: ExtensionRegistry
  readonly authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'>
  readonly logger: Parameters<typeof createSourceProviderContext>[0]['logger']
  readonly store?: ArtifactStore
  readonly fetch?: SourceProviderFetch
}

function invalidDescriptor(message: string): never {
  throw new CtxindexValidationError('invalid_artifact_ref', message)
}

function descriptors(
  resource: StoredResource,
  input: ArtifactServiceInput,
): ArtifactListResult {
  const profile = input.registry.profiles.get(resource.profile)
  if (!profile) {
    return {
      resourceRef: resource.ref,
      artifacts: [],
      warnings: [
        {
          code: 'unknown_profile_version',
          message: `Resource ${resource.ref} uses an unavailable Profile`,
          ref: resource.ref,
        },
      ],
    }
  }
  if (resource.payload === null) {
    return {
      resourceRef: resource.ref,
      artifacts: [],
      warnings: [
        {
          code: 'resource_envelope_only',
          message: `Resource ${resource.ref} has no hydrated payload`,
          ref: resource.ref,
        },
      ],
    }
  }
  const payload = profile.schema.parse(resource.payload)
  const extracted = profile.artifacts?.(payload) ?? []
  if (!Array.isArray(extracted))
    invalidDescriptor('Profile artifacts extractor returned a non-array value')
  const seen = new Set<string>()
  const result: ArtifactDescriptor[] = []
  for (const value of extracted as readonly unknown[]) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      invalidDescriptor(
        'Profile artifacts extractor returned an invalid descriptor',
      )
    }
    const candidate = value as Record<string, unknown>
    if (
      Object.keys(candidate).some(
        (key) => !['ref', 'filename', 'mediaType', 'byteSize'].includes(key),
      ) ||
      typeof candidate.ref !== 'string' ||
      !candidate.ref ||
      (candidate.filename !== undefined &&
        typeof candidate.filename !== 'string') ||
      (candidate.mediaType !== undefined &&
        typeof candidate.mediaType !== 'string') ||
      (candidate.byteSize !== undefined &&
        (typeof candidate.byteSize !== 'number' ||
          !Number.isInteger(candidate.byteSize) ||
          candidate.byteSize < 0))
    ) {
      invalidDescriptor(
        'Profile artifacts extractor returned an invalid descriptor',
      )
    }
    const artifactRef = candidate.ref as string
    const parsed = parseRef(artifactRef)
    if (parsed.sourceId !== resource.sourceId) {
      invalidDescriptor('Artifact descriptor belongs to a different Source')
    }
    const prefix = `${resource.ref}/`
    if (
      !artifactRef.startsWith(prefix) ||
      artifactRef.length === prefix.length
    ) {
      invalidDescriptor(
        'Artifact descriptor must extend its exact Resource Ref',
      )
    }
    if (seen.has(artifactRef))
      invalidDescriptor(`Duplicate Artifact descriptor: ${artifactRef}`)
    seen.add(artifactRef)
    result.push(value as ArtifactDescriptor)
  }
  return { resourceRef: resource.ref, artifacts: result, warnings: [] }
}

function publicArtifact(artifact: Artifact): DownloadedArtifact {
  const { localPath: _localPath, ...result } = artifact
  return result
}

export class ArtifactService {
  private readonly store: ArtifactStore
  private readonly resources: ResourceStore
  private readonly inFlight = new Map<string, Promise<Artifact>>()
  private activeDownloads = 0
  private purging = false

  constructor(private readonly input: ArtifactServiceInput) {
    this.store = input.store ?? new ArtifactStore(input.db)
    this.resources = new ResourceStore(input.db, input.registry.profiles)
  }

  async list(ref: string): Promise<ArtifactListResult> {
    parseRef(ref)
    const resource = this.resources.get(ref)
    if (!resource) throw new CtxindexNotFoundError(`Resource not found: ${ref}`)
    return descriptors(resource, this.input)
  }

  async resolveCached(
    ref: string,
    sourceId: string,
    maxByteSize?: number,
  ): Promise<ActionArtifact | null> {
    const parsed = parseRef(ref)
    if (parsed.sourceId !== sourceId)
      throw new CtxindexValidationError(
        'ref_source_mismatch',
        `Ref "${ref}" does not belong to Source "${sourceId}"`,
      )
    const row = (
      this.input.db
        .prepare(
          'SELECT ref FROM resources WHERE deleted_at IS NULL AND source_id = ? ORDER BY length(ref) DESC',
        )
        .all(sourceId) as { ref: string }[]
    ).find((candidate) => ref.startsWith(`${candidate.ref}/`))
    if (!row) return null
    const descriptor = (await this.list(row.ref)).artifacts.find(
      (candidate) => candidate.ref === ref,
    )
    if (!descriptor) return null
    if (!descriptor.filename)
      throw new CtxindexValidationError(
        'invalid_artifact_ref',
        `Artifact descriptor lacks a filename: ${ref}`,
      )
    if (
      maxByteSize !== undefined &&
      descriptor.byteSize !== undefined &&
      descriptor.byteSize > maxByteSize
    )
      throw new CtxindexValidationError(
        'invalid_action_input',
        `Artifact "${ref}" exceeds the remaining ${maxByteSize}-byte Action limit`,
      )
    const cached = await this.store.read(ref, maxByteSize)
    if (!cached) return null
    const mediaType = descriptor.mediaType ?? 'application/octet-stream'
    if (
      cached.artifact.originRef !== row.ref ||
      cached.artifact.mediaType !== mediaType ||
      (descriptor.byteSize !== undefined &&
        descriptor.byteSize !== cached.artifact.byteSize)
    )
      throw new CtxindexError(
        `Artifact descriptor no longer matches cached metadata: ${ref}`,
        'data_integrity',
      )
    return {
      ref,
      originRef: row.ref,
      filename: descriptor.filename,
      mediaType,
      byteSize: cached.artifact.byteSize,
      bytes: cached.bytes,
    }
  }

  async download(
    ref: string,
    options: {
      readonly outputPath?: string
      readonly signal?: AbortSignal
    } = {},
  ): Promise<ArtifactDownloadResult> {
    if (this.purging)
      throw new CtxindexError('Artifact purge is in progress', 'conflict')
    this.activeDownloads += 1
    try {
      parseRef(ref)
      const cached = await this.store.get(ref)
      if (cached) return this.finish(cached, 'hit', options.outputPath)

      let pending = this.inFlight.get(ref)
      if (!pending) {
        pending = this.materialize(
          ref,
          options.signal ?? new AbortController().signal,
        )
        this.inFlight.set(ref, pending)
        void pending
          .finally(() => this.inFlight.delete(ref))
          .catch(() => undefined)
      }
      return this.finish(await pending, 'miss', options.outputPath)
    } finally {
      this.activeDownloads -= 1
    }
  }

  async purge(): Promise<ArtifactPurgeResult> {
    if (this.purging || this.activeDownloads > 0) {
      throw new CtxindexError(
        'Cannot purge Artifacts while downloads are in flight',
        'conflict',
      )
    }
    this.purging = true
    try {
      return await this.store.purge()
    } finally {
      this.purging = false
    }
  }

  private async materialize(
    ref: string,
    signal: AbortSignal,
  ): Promise<Artifact> {
    const row = (
      this.input.db
        .prepare(`
      SELECT ref FROM resources
      WHERE deleted_at IS NULL AND source_id = ?
      ORDER BY length(ref) DESC
    `)
        .all(parseRef(ref).sourceId) as { ref: string }[]
    ).find((candidate) => ref.startsWith(`${candidate.ref}/`))
    if (!row)
      throw new CtxindexNotFoundError(`Artifact descriptor not found: ${ref}`)
    const listed = await this.list(row.ref)
    const descriptor = listed.artifacts.find(
      (candidate) => candidate.ref === ref,
    )
    if (!descriptor)
      throw new CtxindexNotFoundError(`Artifact descriptor not found: ${ref}`)

    const source = this.input.db
      .prepare('SELECT adapter_id FROM sources WHERE id = ?')
      .get(parseRef(ref).sourceId) as {
      adapter_id: string
    } | null
    if (!source) throw new CtxindexNotFoundError('Source not found')
    const adapter = this.input.registry.adapters.get({ id: source.adapter_id })
    if (
      !adapter?.capabilities.includes('download') ||
      !adapter.operations.download
    ) {
      throw new CtxindexError(
        'Source Adapter does not support Artifact download',
        'unsupported_capability',
      )
    }
    const provider = await createSourceProviderContext({
      db: this.input.db,
      sourceId: parseRef(ref).sourceId,
      registry: this.input.registry,
      authService: this.input.authService,
      logger: this.input.logger,
      ...(this.input.fetch ? { fetch: this.input.fetch } : {}),
    })
    const resolved: ResolvedArtifactDescriptor = {
      ...descriptor,
      originRef: row.ref,
    }
    return this.store.write(
      {
        ref: descriptor.ref,
        originRef: row.ref,
        mediaType: descriptor.mediaType ?? 'application/octet-stream',
        retentionClass: 'cached',
        ...(descriptor.byteSize === undefined
          ? {}
          : { byteSize: descriptor.byteSize }),
      },
      async (writer) =>
        provider.adapter.operations.download?.({
          source: provider.source,
          artifact: resolved,
          signal,
          fetch: provider.fetch,
          logger: provider.logger,
          write: (chunk) => writer.write(chunk),
        }),
    )
  }

  private async finish(
    artifact: Artifact,
    cache: 'hit' | 'miss',
    outputPath: string | undefined,
  ): Promise<ArtifactDownloadResult> {
    if (outputPath !== undefined)
      await this.store.copyTo(artifact.ref, outputPath)
    return {
      artifact: publicArtifact(artifact),
      cache,
      ...(outputPath === undefined ? {} : { outputPath }),
    }
  }
}
