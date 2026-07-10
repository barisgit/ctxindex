import Table from 'cli-table3'

export interface GrantSummary {
  readonly id: string
  readonly provider: string
  readonly scopes: string
  readonly expiresAt: number | null
  readonly accountEmail?: string | null
  readonly accountDisplayName?: string | null
}

const NO_EXPIRY = 'no expiry'
const EXPIRED = 'expired'

function parseScopes(scopes: string): string[] {
  if (scopes.length === 0) return []
  const trimmed = scopes.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === 'string')
      }
    } catch {
      // fall through to whitespace split
    }
  }
  return trimmed.split(/\s+/).filter((s) => s.length > 0)
}

function formatExpiry(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return NO_EXPIRY
  if (expiresAt <= now) return EXPIRED
  return new Date(expiresAt).toISOString().replace('T', ' ').slice(0, 16)
}

function formatScopeList(scopes: string): string {
  const parsed = parseScopes(scopes)
  if (parsed.length === 0) return '-'
  // Strip the common Google scope prefix for compactness, but keep full
  // scope visible if it is not a Google scope.
  const shortened = parsed.map((s) =>
    s.startsWith('https://www.googleapis.com/auth/')
      ? s.slice('https://www.googleapis.com/auth/'.length)
      : s,
  )
  return shortened.join(', ')
}

function accountLabel(row: GrantSummary): string | null {
  const label = row.accountEmail ?? row.accountDisplayName ?? null
  if (!label || label === row.provider) return null
  return label
}

export function formatGrants(
  rows: readonly GrantSummary[],
  opts: { readonly json: boolean; readonly now?: number },
): string {
  if (opts.json) return JSON.stringify(rows, null, 2)
  if (rows.length === 0) {
    return 'No OAuth grants. Add one with: ctxindex auth add google'
  }
  const now = opts.now ?? Date.now()
  const labelledRows = rows.map((row) => ({ row, label: accountLabel(row) }))
  const showLabel = labelledRows.some(({ label }) => label !== null)
  const table = new Table({
    head: showLabel
      ? ['Label', 'Provider', 'Scopes', 'Expires', 'ID']
      : ['Provider', 'Scopes', 'Expires', 'ID'],
    colWidths: showLabel ? [26, 10, 34, 18, 28] : [12, 40, 19, 28],
    colAligns: showLabel
      ? ['left', 'left', 'left', 'left', 'left']
      : ['left', 'left', 'left', 'left'],
    wordWrap: true,
    wrapOnWordBoundary: false,
    style: { head: [], border: [] },
  })
  for (const { row, label } of labelledRows) {
    table.push(
      showLabel
        ? [
            label ?? '-',
            row.provider,
            formatScopeList(row.scopes),
            formatExpiry(row.expiresAt, now),
            row.id,
          ]
        : [
            row.provider,
            formatScopeList(row.scopes),
            formatExpiry(row.expiresAt, now),
            row.id,
          ],
    )
  }
  return table.toString()
}

export function formatGrantAdded(grantId: string): string {
  return `auth grant added: ${grantId}`
}
