import type { StatusRow } from '@ctxindex/core/source'

function displayStatus(row: StatusRow): string {
  return row.availability === 'extension_unavailable'
    ? row.availability
    : row.lastStatus
}

function warningText(row: StatusRow): string | null {
  if (!row.lastWarning) return null
  return `${row.lastWarning.code}: ${row.lastWarning.message}${row.lastWarning.ref ? ` (${row.lastWarning.ref})` : ''}`
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
          `warnings=${row.warningsCount}`,
          row.lastWarning
            ? `warning=${row.lastWarning.code}:${row.lastWarning.message.replace(/\s+/g, '_')}${row.lastWarning.ref ? `:ref=${row.lastWarning.ref}` : ''}`
            : null,
          `errors=${row.errorsCount}`,
          row.lastError ? `error=${row.lastError.replace(/\s+/g, '_')}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' '),
      )
      .join('\n')
  }

  return rows
    .map((row) => {
      const warning = warningText(row)
      return `${row.sourceId}\t${row.adapterId}\t${row.realmSlug}\t${displayStatus(row)}\twarnings=${row.warningsCount}${warning ? `\t${warning}` : ''}\terrors=${row.errorsCount}${row.lastError ? `\t${row.lastError}` : ''}`
    })
    .join('\n')
}
