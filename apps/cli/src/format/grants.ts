export interface GrantSummary {
  readonly id: string
  readonly provider: string
  readonly scopes: string
  readonly expiresAt: number | null
}

export function formatGrants(
  rows: readonly GrantSummary[],
  opts: { readonly json: boolean },
): string {
  if (opts.json) return JSON.stringify(rows, null, 2)
  return rows.map((row) => `${row.id}\t${row.provider}`).join('\n')
}

export function formatGrantAdded(grantId: string): string {
  return `auth grant added: ${grantId}`
}
