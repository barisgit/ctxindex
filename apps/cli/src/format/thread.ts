import type { ThreadNode, ThreadResult } from '@ctxindex/core/thread'
import type { RpcThreadGetResult } from '@ctxindex/rpc'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputEnvironment,
} from './output'

type FormattableThread = ThreadResult | RpcThreadGetResult
type FormattableThreadNode = ThreadNode | RpcThreadGetResult['messages'][number]

const threadColumns = [
  { key: 'depth', label: 'Depth', align: 'right' },
  { key: 'ref', label: 'Ref' },
  { key: 'sourceId', label: 'Source' },
  { key: 'realmId', label: 'Realm' },
  { key: 'profile', label: 'Profile' },
  { key: 'origin', label: 'Origin' },
  { key: 'title', label: 'Title' },
  { key: 'summary', label: 'Summary' },
  { key: 'occurredAt', label: 'Occurred at' },
  { key: 'providerUpdatedAt', label: 'Provider updated at' },
  { key: 'deletedAt', label: 'Deleted at' },
  { key: 'hydratedAt', label: 'Hydrated at' },
  { key: 'payload', label: 'Payload' },
  { key: 'createdAt', label: 'Created at' },
  { key: 'updatedAt', label: 'Updated at' },
] satisfies readonly OutputColumn[]

function appendRows(
  node: FormattableThreadNode,
  depth: number,
  rows: Record<string, unknown>[],
): void {
  rows.push({
    depth,
    ...node.resource,
    profile: compactJson(node.resource.profile),
    payload:
      node.resource.payload === null
        ? null
        : compactJson(node.resource.payload),
  })
  for (const child of node.children) appendRows(child, depth + 1, rows)
}

function threadRows(
  result: FormattableThread,
): readonly Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  for (const message of result.messages) appendRows(message, 0, rows)
  return rows
}

export function formatThreadJson(result: FormattableThread): string {
  return compactJson(result)
}

export function formatThreadText(result: FormattableThread): string {
  return formatTsv(threadColumns, threadRows(result))
}

export function formatThreadPretty(
  result: FormattableThread,
  environment?: Pick<OutputEnvironment, 'columns'>,
): string {
  return formatPrettyCollection(threadColumns, threadRows(result), environment)
}
