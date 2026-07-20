import type {
  SearchRemoteQuery,
  SearchRemoteResult,
  SearchRemoteWarning,
} from '@ctxindex/extension-sdk'
import { CtxindexError } from '../errors'
import type { ProfileRegistry } from '../registry'
import { ResourceStore } from '../resource'
import {
  isStorageContention,
  STORAGE_BUSY_MESSAGE,
} from '../storage/contention'
import {
  type CreateSourceProviderContextInput,
  createSourceProviderContext,
} from './provider-context'

export interface SearchSourceRemoteInput
  extends CreateSourceProviderContextInput {
  readonly query: SearchRemoteQuery
  readonly signal: AbortSignal
}

function matchesQuery(
  resource: SearchRemoteResult['resources'][number],
  query: SearchRemoteQuery,
  profiles: ProfileRegistry,
): { readonly matches: boolean; readonly warning?: SearchRemoteWarning } {
  if (
    query.since !== undefined &&
    (resource.occurredAt == null || resource.occurredAt < query.since)
  ) {
    return { matches: false }
  }
  if (
    query.until !== undefined &&
    (resource.occurredAt == null || resource.occurredAt > query.until)
  ) {
    return { matches: false }
  }
  for (const filter of query.fields ?? []) {
    const profile = profiles.get(resource.profile)
    const extractor = profile?.search?.fields?.[filter.name]?.extract
    if (resource.payload === undefined || extractor === undefined) {
      return {
        matches: false,
        warning: {
          code: 'provider_filter_unverifiable',
          message: `Provider resource ${resource.ref} lacks payload required to verify field ${filter.name}`,
          ref: resource.ref,
        },
      }
    }
    const parsed = profile?.schema.safeParse(resource.payload)
    if (!parsed) return { matches: false }
    if (!parsed.success) {
      return {
        matches: false,
        warning: {
          code: 'provider_filter_unverifiable',
          message: `Provider resource ${resource.ref} has invalid payload required to verify field ${filter.name}`,
          ref: resource.ref,
        },
      }
    }
    const extracted = extractor(parsed.data)
    const values = Array.isArray(extracted) ? extracted : [extracted]
    const expected =
      filter.type === 'datetime' && typeof filter.value === 'number'
        ? filter.value
        : filter.value
    const matches = values.some((value) => {
      if (filter.type === 'datetime') {
        const timestamp =
          value instanceof Date
            ? value.getTime()
            : typeof value === 'string'
              ? Date.parse(value)
              : value
        return timestamp === expected
      }
      return value === expected
    })
    if (!matches) return { matches: false }
  }
  return { matches: true }
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function searchSourceRemote(
  input: SearchSourceRemoteInput,
): Promise<SearchRemoteResult> {
  const provider = await createSourceProviderContext({
    db: input.db,
    sourceId: input.sourceId,
    registry: input.registry,
    authService: input.authService,
    logger: input.logger,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  })
  const searchRemote = provider.adapter.operations.searchRemote
  if (!searchRemote) {
    throw new CtxindexError(
      `Adapter "${provider.adapter.id}" does not support remote search`,
      'remote_search_unsupported',
    )
  }

  const result = await searchRemote({
    source: provider.source,
    fetch: provider.fetch,
    logger: provider.logger,
    query: input.query,
    signal: input.signal,
  })
  const verified: SearchRemoteResult['resources'][number][] = []
  const filterWarnings: SearchRemoteWarning[] = []
  for (const resource of result.resources) {
    const verification = matchesQuery(
      resource,
      input.query,
      input.registry.profiles,
    )
    if (verification.matches) verified.push(resource)
    if (verification.warning) filterWarnings.push(verification.warning)
  }
  const resources = new ResourceStore(input.db, input.registry.profiles)
  const warnings: SearchRemoteWarning[] = [
    ...result.warnings,
    ...filterWarnings,
  ]
  input.signal.throwIfAborted()
  const uniqueResources = new Map<string, (typeof verified)[number]>()
  for (const resource of verified) uniqueResources.set(resource.ref, resource)
  const materializationResources = [...uniqueResources.values()]
  try {
    const materialized = resources.upsertMany(
      materializationResources.map((resource) => ({
        ref: resource.ref,
        sourceId: input.sourceId,
        profile: resource.profile,
        origin: 'adhoc',
        completeness: 'partial',
        ...(resource.title !== undefined ? { title: resource.title } : {}),
        ...(resource.summary !== undefined
          ? { summary: resource.summary }
          : {}),
        ...(resource.occurredAt !== undefined
          ? { occurredAt: resource.occurredAt }
          : {}),
        ...(resource.providerUpdatedAt !== undefined
          ? { providerUpdatedAt: resource.providerUpdatedAt }
          : {}),
        ...(resource.payload !== undefined
          ? { payload: resource.payload }
          : {}),
      })),
    )
    await nextEventLoopTurn()
    input.signal.throwIfAborted()
    for (const [index, result] of materialized.entries()) {
      const resource = materializationResources[index]
      if (!resource) continue
      for (const warning of result.warnings) {
        warnings.push({
          code: warning.code,
          message: `Resource ${resource.ref} uses unavailable Profile ${warning.profileId}@${warning.profileVersion}`,
          ref: resource.ref,
        })
      }
    }
  } catch (error) {
    await nextEventLoopTurn()
    input.signal.throwIfAborted()
    if (!isStorageContention(error)) throw error
    warnings.push({
      code: 'storage_busy',
      message:
        error instanceof CtxindexError && error.code === 'storage_busy'
          ? error.message
          : STORAGE_BUSY_MESSAGE,
    })
  }
  return {
    resources: verified,
    warnings,
    ...(result.continuation === undefined
      ? {}
      : { continuation: result.continuation }),
  }
}
