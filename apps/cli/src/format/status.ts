import type { StatusRow } from '@ctxindex/core/source'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputFormat,
} from './output'

function displayStatus(row: StatusRow): string {
  return row.availability === 'extension_unavailable'
    ? row.availability
    : row.lastStatus
}

export function formatStatus(
  rows: readonly StatusRow[],
  format: OutputFormat,
): string {
  if (format === 'json') return compactJson(rows)
  const projected = rows.map((row) => ({
    ...row,
    status: displayStatus(row),
  }))
  const columns = [
    { key: 'sourceId', label: 'Source' },
    { key: 'adapterId', label: 'Adapter' },
    { key: 'realmSlug', label: 'Realm' },
    { key: 'status', label: 'Status' },
    { key: 'warningsCount', label: 'Warnings', align: 'right' },
    { key: 'lastWarning', label: 'Last warning' },
    { key: 'errorsCount', label: 'Errors', align: 'right' },
    { key: 'lastError', label: 'Last error' },
    { key: 'lastRunAt', label: 'Last run' },
  ] satisfies readonly OutputColumn[]
  return format === 'pretty'
    ? formatPrettyCollection(columns, projected)
    : formatTsv(columns, projected)
}
