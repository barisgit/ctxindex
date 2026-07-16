import type { AccountInventoryItem } from '@ctxindex/core/account'

function label(value: string | null, fallback: string): string {
  return value === null ? fallback : JSON.stringify(value)
}

export function formatAccountInventory(
  accounts: readonly AccountInventoryItem[],
  json: boolean,
): string {
  if (json) return JSON.stringify(accounts, null, 2)
  if (accounts.length === 0) return 'No Accounts configured.'

  const lines: string[] = []
  for (const account of accounts) {
    lines.push(
      `ACCOUNT ${account.id}  provider=${account.provider}  label=${label(account.label, '(unlabeled)')}`,
    )
    for (const grant of account.grants) {
      lines.push(
        `  GRANT ${grant.id}  ${grant.expiryState}  expiresAt=${grant.expiresAt ?? '-'}`,
        `    scopes: ${grant.scopes.join(', ') || 'none'}`,
      )
      for (const source of grant.sources) {
        lines.push(
          `    SOURCE ${source.id}  name=${label(source.displayName, '(unnamed)')}  adapter=${source.adapter.id}@${source.adapter.version}  realm=${source.realm.slug}`,
        )
      }
    }
  }
  return lines.join('\n')
}
