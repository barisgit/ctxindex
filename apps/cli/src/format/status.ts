import type { StatusRow } from '@ctxindex/core/source'

function displayStatus(row: StatusRow): string {
  return row.availability === 'extension_unavailable'
    ? row.availability
    : row.lastStatus
}

export function formatStatus(
  rows: StatusRow[],
  opts: { readonly json: boolean; readonly format?: 'summary' | 'compact' },
): string {
  if (opts.json) return JSON.stringify(rows, null, 2)
  if (opts.format === 'compact') {
    return rows
      .map((row) =>
        [
          row.sourceId,
          `adapter=${row.adapterId}`,
          `realm=${row.realmSlug}`,
          `status=${displayStatus(row)}`,
          `errors=${row.errorsCount}`,
          row.lastError ? `error=${row.lastError.replace(/\s+/g, '_')}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' '),
      )
      .join('\n')
  }

  return rows
    .map(
      (row) =>
        `${row.sourceId}\t${row.adapterId}\t${row.realmSlug}\t${displayStatus(row)}\terrors=${row.errorsCount}${row.lastError ? `\t${row.lastError}` : ''}`,
    )
    .join('\n')
}
