import type { RetrievedResource } from '@ctxindex/extension-sdk'
import { CtxindexError } from '../errors'
import { parseRef } from '../ref/ref'
import type { ExtensionRegistry } from '../registry'
import { ResourceStore, type StoredResource } from '../resource'
import {
  type CreateSourceProviderContextInput,
  createSourceProviderContext,
} from './provider-context'

export interface SourceResourceWarning {
  readonly code: string
  readonly message: string
  readonly ref: string
}

export interface SourceResourceResult {
  readonly resource: StoredResource
  readonly warnings: readonly SourceResourceWarning[]
}

export interface RetrieveSourceResourceInput
  extends Omit<CreateSourceProviderContextInput, 'sourceId'> {
  readonly ref: string
  readonly signal: AbortSignal
}

function unknownProfileWarning(
  resource: StoredResource,
  registry: ExtensionRegistry,
): SourceResourceWarning[] {
  if (registry.profiles.get(resource.profile)) return []
  return [
    {
      code: 'unknown_profile_version',
      message: `Resource ${resource.ref} uses unavailable Profile ${resource.profile.id}@${resource.profile.version}`,
      ref: resource.ref,
    },
  ]
}

export async function retrieveSourceResource(
  input: RetrieveSourceResourceInput,
): Promise<SourceResourceResult> {
  const parsed = parseRef(input.ref)
  const provider = await createSourceProviderContext({
    db: input.db,
    sourceId: parsed.sourceId,
    registry: input.registry,
    authService: input.authService,
    logger: input.logger,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  })
  const retrieve = provider.adapter.operations.retrieve
  if (!retrieve) {
    throw new CtxindexError(
      `Adapter "${provider.adapter.id}" does not support retrieval`,
      'retrieve_unsupported',
    )
  }

  const emitted: RetrievedResource[] = []
  await retrieve({
    source: provider.source,
    fetch: provider.fetch,
    logger: provider.logger,
    ref: input.ref,
    signal: input.signal,
    emitResource(resource) {
      emitted.push(resource)
    },
    emitArtifact() {},
  })
  input.signal.throwIfAborted()
  const resource = emitted[0]
  if (
    emitted.length !== 1 ||
    resource?.ref !== input.ref ||
    !Object.hasOwn(resource ?? {}, 'payload') ||
    resource?.payload === undefined
  ) {
    throw new CtxindexError(
      `Adapter retrieval for ${input.ref} must emit exactly one Resource with the requested Ref and payload`,
      'invalid_retrieve_result',
    )
  }

  const store = new ResourceStore(input.db, input.registry.profiles)
  input.signal.throwIfAborted()
  const materialized = store.upsert({
    ref: resource.ref,
    sourceId: parsed.sourceId,
    profile: resource.profile,
    origin: 'adhoc',
    completeness: 'complete',
    ...(resource.title !== undefined ? { title: resource.title } : {}),
    ...(resource.summary !== undefined ? { summary: resource.summary } : {}),
    ...(resource.occurredAt !== undefined
      ? { occurredAt: resource.occurredAt }
      : {}),
    ...(resource.providerUpdatedAt !== undefined
      ? { providerUpdatedAt: resource.providerUpdatedAt }
      : {}),
    payload: resource.payload,
  })
  const stored = store.get(input.ref, { includeDeleted: true })
  if (!stored) {
    throw new CtxindexError(
      `Retrieved Resource ${input.ref} was not stored`,
      'invalid_retrieve_result',
    )
  }
  return {
    resource: stored,
    warnings: materialized.warnings.map((warning) => ({
      code: warning.code,
      message: `Resource ${input.ref} uses unavailable Profile ${warning.profileId}@${warning.profileVersion}`,
      ref: input.ref,
    })),
  }
}

export async function getSourceResource(
  input: RetrieveSourceResourceInput,
): Promise<SourceResourceResult> {
  parseRef(input.ref)
  const store = new ResourceStore(input.db, input.registry.profiles)
  const cached = store.get(input.ref, { includeDeleted: true })
  if (cached?.deletedAt != null || cached?.hydratedAt != null) {
    return {
      resource: cached,
      warnings: unknownProfileWarning(cached, input.registry),
    }
  }
  return retrieveSourceResource(input)
}
