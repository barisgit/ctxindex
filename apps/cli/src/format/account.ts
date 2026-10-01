import type { AccountInventoryItem } from '@ctxindex/core/account'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputFormat,
} from './output'

function label(value: string | null, fallback: string): string {
  return value === null ? fallback : value
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
  format: OutputFormat,
): string {
  if (format === 'json') return compactJson(accounts)
  const rows = accounts.map((account) => ({
    id: account.id,
    provider: account.provider,
    label: label(account.label, '(unlabeled)'),
    expiryState: account.expiryState,
    expiresAt: account.expiresAt,
    sources: compactJson(account.sources),
  }))
  const columns = [
    { key: 'label', label: 'Account' },
    { key: 'provider', label: 'Provider' },
    { key: 'expiryState', label: 'Auth' },
    { key: 'expiresAt', label: 'Expires at' },
    { key: 'sources', label: 'Sources' },
    { key: 'id', label: 'ID' },
  ] satisfies readonly OutputColumn[]
  return format === 'pretty'
    ? formatPrettyCollection(columns, rows)
    : formatTsv(columns, rows)
}
