import { CtxindexNotFoundError, CtxindexValidationError } from '../errors'
import type { ExtensionRegistry } from '../registry'
import { type ActionDescription, describeRegistry } from '../registry'
import type { CtxindexDatabase } from '../storage'

interface SourceRow {
  readonly id: string
  readonly adapter_id: string
}

export interface ActionSourceAvailability {
  readonly id: string
  readonly adapter: { readonly id: string }
  readonly available: boolean
  readonly reason?: 'adapter_unavailable' | 'action_unsupported'
}

export interface DescribeActionInput {
  readonly db: CtxindexDatabase
  readonly registry: ExtensionRegistry
  readonly actionId: string
  readonly sourceId?: string
}

export interface DescribeActionResult extends ActionDescription {
  readonly sources: readonly ActionSourceAvailability[]
}

export function describeAction(
  input: DescribeActionInput,
): DescribeActionResult {
  const action = describeRegistry(input.registry).actions.find(
    (candidate) => candidate.id === input.actionId,
  )
  if (!action) {
    throw new CtxindexValidationError(
      'unknown_action',
      `Unknown Action: ${input.actionId}`,
    )
  }

  const sources = input.sourceId
    ? (input.db
        .prepare('SELECT id, adapter_id FROM sources WHERE id = ?')
        .all(input.sourceId) as SourceRow[])
    : (input.db
        .prepare('SELECT id, adapter_id FROM sources ORDER BY id')
        .all() as SourceRow[])
  if (input.sourceId && sources.length === 0) {
    throw new CtxindexNotFoundError(`Source not found: ${input.sourceId}`)
  }

  return {
    ...action,
    sources: sources.map((source) => {
      const adapter = input.registry.adapters.get({ id: source.adapter_id })
      const available = adapter?.actions[input.actionId] !== undefined
      return {
        id: source.id,
        adapter: { id: source.adapter_id },
        available,
        ...(available
          ? {}
          : {
              reason: adapter
                ? ('action_unsupported' as const)
                : ('adapter_unavailable' as const),
            }),
      }
    }),
  }
}
