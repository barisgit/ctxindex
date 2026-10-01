import type { OAuthAppInventoryItem } from '@ctxindex/core/oauth-app'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputFormat,
} from './output'

export function formatOAuthAppAdded(providerId: string, label: string): string {
  return `OAuth App added: ${providerId} ${JSON.stringify(label)}`
}

export function formatOAuthAppInventory(
  apps: readonly OAuthAppInventoryItem[],
  format: OutputFormat,
): string {
  if (format === 'json') return compactJson(apps)
  const rows = apps.map((app) => ({ ...app }))
  const columns = [
    { key: 'providerId', label: 'Provider' },
    { key: 'label', label: 'OAuth App' },
    { key: 'origin', label: 'Origin' },
    { key: 'provenance', label: 'Provenance' },
  ] satisfies readonly OutputColumn[]
  return format === 'pretty'
    ? formatPrettyCollection(columns, rows)
    : formatTsv(columns, rows)
}

export function formatOAuthAppRemoved(
  providerId: string,
  label: string,
): string {
  return `OAuth App removed: ${providerId} ${JSON.stringify(label)}`
}
