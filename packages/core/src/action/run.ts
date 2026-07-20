import { z } from 'zod'
import { ArtifactService } from '../artifact'
import {
  CtxindexError,
  CtxindexNotFoundError,
  CtxindexValidationError,
} from '../errors'
import { parseRef } from '../ref'
import { ResourceStore, type StoredResource } from '../resource'
import {
  type CreateSourceProviderContextInput,
  createSourceProviderContext,
} from '../source/provider-context'

const resultSchema = z.object({
  ref: z.string().min(1),
  profile: z.object({
    id: z.string().min(1),
    version: z.number().int().positive(),
  }),
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  occurredAt: z.number().nullable().optional(),
  providerUpdatedAt: z.number().nullable().optional(),
  payload: z.unknown(),
})

interface SourceActionRow {
  readonly adapter_id: string
}

export interface RunActionInput
  extends Omit<
    CreateSourceProviderContextInput,
    'sourceId' | 'retryUnauthorized'
  > {
  readonly actionId: string
  readonly sourceId: string
  readonly actionInput: unknown
  readonly signal: AbortSignal
  readonly confirmIrreversible?: boolean
}

export interface ActionResourceWarning {
  readonly code: string
  readonly message: string
  readonly ref: string
}

export interface RunActionResult {
  readonly resource: StoredResource
  readonly warnings: readonly ActionResourceWarning[]
}

function sameProfile(
  left: { readonly id: string; readonly version: number },
  right: { readonly id: string; readonly version: number },
): boolean {
  return left.id === right.id && left.version === right.version
}

function invalidResult(actionId: string): CtxindexError {
  return new CtxindexError(
    `Adapter returned an invalid result for Action ${actionId}`,
    'invalid_action_result',
  )
}

export async function runAction(
  input: RunActionInput,
): Promise<RunActionResult> {
  const declarations = input.registry.profiles.list().flatMap((profile) => {
    const action = profile.actions?.[input.actionId]
    return action ? [{ profile, action }] : []
  })
  const declaration = declarations[0]
  if (!declaration) {
    throw new CtxindexValidationError(
      'unknown_action',
      `Unknown Action: ${input.actionId}`,
    )
  }

  const parsedInput = declaration.action.input.safeParse(input.actionInput)
  if (!parsedInput.success) {
    throw new CtxindexValidationError(
      'invalid_action_input',
      `Invalid input for Action ${input.actionId}: ${parsedInput.error.issues[0]?.message ?? 'validation failed'}`,
    )
  }
  if (
    declaration.action.effect === 'irreversible' &&
    input.confirmIrreversible !== true
  ) {
    throw new CtxindexValidationError(
      'confirmation_required',
      `Action ${input.actionId} is irreversible and requires explicit confirmation`,
    )
  }

  const source = input.db
    .prepare('SELECT adapter_id FROM sources WHERE id = ?')
    .get(input.sourceId) as SourceActionRow | null
  if (!source) {
    throw new CtxindexNotFoundError(`Source not found: ${input.sourceId}`)
  }
  const adapter = input.registry.adapters.get({ id: source.adapter_id })
  const binding = adapter?.actions[input.actionId]
  if (!adapter || !binding) {
    const available = input.registry.adapters
      .list()
      .filter((candidate) => input.actionId in candidate.actions)
      .map((candidate) => candidate.id)
      .sort()
    throw new CtxindexValidationError(
      'action_unsupported',
      `Action ${input.actionId} is unsupported for Source ${input.sourceId} using Adapter ${source.adapter_id}; available implementing Adapters: ${available.join(', ') || 'none'}`,
    )
  }

  const store = new ResourceStore(input.db, input.registry.profiles)
  const resolveResource = (ref: string) => {
    const parsed = parseRef(ref)
    if (parsed.sourceId !== input.sourceId) {
      throw new CtxindexValidationError(
        'ref_source_mismatch',
        `Ref "${ref}" does not belong to Source "${input.sourceId}"`,
      )
    }
    const resource = store.get(ref, { includeDeleted: true })
    return resource
      ? {
          ref: resource.ref,
          sourceId: resource.sourceId,
          profile: resource.profile,
          completeness:
            resource.hydratedAt === null
              ? ('partial' as const)
              : ('complete' as const),
          deletedAt: resource.deletedAt,
          payload: resource.payload,
        }
      : null
  }
  const artifacts = new ArtifactService({
    db: input.db,
    registry: input.registry,
    authService: input.authService,
    logger: input.logger,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  })
  const resolveArtifact = (ref: string, maxByteSize?: number) =>
    artifacts.resolveCached(ref, input.sourceId, maxByteSize)

  const provider = await createSourceProviderContext({
    db: input.db,
    sourceId: input.sourceId,
    registry: input.registry,
    authService: input.authService,
    logger: input.logger,
    retryUnauthorized: false,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  })
  const returned = await binding.run({
    source: provider.source,
    fetch: provider.fetch,
    logger: provider.logger,
    input: parsedInput.data,
    signal: input.signal,
    resolveResource,
    resolveArtifact,
  })

  const parsedResult = resultSchema.safeParse(returned)
  if (
    !parsedResult.success ||
    !sameProfile(parsedResult.data.profile, declaration.action.output)
  ) {
    throw invalidResult(input.actionId)
  }
  let parsedRef: ReturnType<typeof parseRef>
  try {
    parsedRef = parseRef(parsedResult.data.ref)
  } catch {
    throw invalidResult(input.actionId)
  }
  if (parsedRef.sourceId !== input.sourceId) {
    throw invalidResult(input.actionId)
  }
  const outputProfile = input.registry.profiles.get(declaration.action.output)
  if (!outputProfile) {
    throw invalidResult(input.actionId)
  }
  const payload = outputProfile.schema.safeParse(parsedResult.data.payload)
  if (!payload.success || parsedResult.data.payload === undefined) {
    throw invalidResult(input.actionId)
  }

  const materialized = store.upsert({
    ref: parsedResult.data.ref,
    sourceId: input.sourceId,
    profile: parsedResult.data.profile,
    origin: 'adhoc',
    completeness: 'complete',
    ...(parsedResult.data.title !== undefined
      ? { title: parsedResult.data.title }
      : {}),
    ...(parsedResult.data.summary !== undefined
      ? { summary: parsedResult.data.summary }
      : {}),
    ...(parsedResult.data.occurredAt !== undefined
      ? { occurredAt: parsedResult.data.occurredAt }
      : {}),
    ...(parsedResult.data.providerUpdatedAt !== undefined
      ? { providerUpdatedAt: parsedResult.data.providerUpdatedAt }
      : {}),
    payload: payload.data,
  })
  const stored = store.get(parsedResult.data.ref, { includeDeleted: true })
  if (!stored) throw invalidResult(input.actionId)

  return {
    resource: stored,
    warnings: materialized.warnings.map((warning) => ({
      code: warning.code,
      message: `Resource ${stored.ref} uses unavailable Profile ${warning.profileId}@${warning.profileVersion}`,
      ref: stored.ref,
    })),
  }
}
