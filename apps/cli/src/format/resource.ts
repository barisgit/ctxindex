import type { SourceResourceResult } from '@ctxindex/core/source'
import type { RpcResourceGetResult } from '@ctxindex/rpc'
import {
  compactJson,
  escapeTsv,
  formatPrettyRecord,
  type OutputColumn,
} from './output'

type FormattableGetResult = SourceResourceResult | RpcResourceGetResult

const resourceFields = [
  { key: 'id', label: 'ID' },
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

function prettyProjection(
  result: FormattableGetResult,
): Record<string, unknown> {
  return Object.fromEntries(
    resourceFields.map(({ key }) => {
      const value = result.resource[key as keyof typeof result.resource]
      return [
        key,
        value !== null && typeof value === 'object'
          ? compactJson(value)
          : value === null
            ? 'null'
            : value,
      ]
    }),
  )
}

export function formatGetJson(result: FormattableGetResult): string {
  return compactJson(result)
}

export function formatGetText(result: FormattableGetResult): string {
  return resourceFields
    .map(({ key }) => {
      const value = result.resource[key as keyof typeof result.resource]
      const text =
        value !== null && typeof value === 'object'
          ? compactJson(value)
          : escapeTsv(value)
      return `${key}\t${text}`
    })
    .join('\n')
}

export function formatGetPretty(result: FormattableGetResult): string {
  return formatPrettyRecord(resourceFields, prettyProjection(result))
}
