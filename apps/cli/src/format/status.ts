import type { StatusRow } from '@ctxindex/core/source'

export function formatStatus(
  rows: StatusRow[],
  opts: { readonly json: boolean },
): string {
  if (opts.json) return JSON.stringify(rows, null, 2)
  return rows
    .map(
      (row) =>
        `${row.sourceId}\t${row.adapterId}\t${row.realmSlug}\t${row.lastStatus}`,
    )
    .join('\n')
}
