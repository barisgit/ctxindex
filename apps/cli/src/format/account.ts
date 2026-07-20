import type { AccountInventoryItem } from '@ctxindex/core/account'

function label(value: string | null, fallback: string): string {
  return value === null ? fallback : JSON.stringify(value)
}

export function formatAccountAdded(result: {
  readonly accountId: string
}): string {
  return `account added: ${result.accountId}`
}

export function formatAccountRemoved(label: string): string {
  return `account removed: ${JSON.stringify(label)}`
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
      `  AUTH ${account.expiryState}  expiresAt=${account.expiresAt ?? '-'}`,
    )
    for (const source of account.sources) {
      lines.push(
        `  SOURCE ${source.id}  label=${JSON.stringify(source.label)}  adapter=${source.adapter.id}  realm=${source.realm.slug}`,
      )
    }
  }
  return lines.join('\n')
}
