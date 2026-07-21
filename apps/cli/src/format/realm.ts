import type { RealmRow } from '@ctxindex/core/realm'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputFormat,
} from './output'

export function formatRealmAdded(slug: string): string {
  return `realm added: ${slug}`
}

export function formatRealms(
  realms: readonly RealmRow[],
  format: OutputFormat,
): string {
  const rows = realms.map((realm) => ({
    id: realm.id,
    slug: realm.slug,
    label: realm.label,
    createdAt: realm.created_at,
  }))
  if (format === 'json') return compactJson(rows)
  const columns = [
    { key: 'slug', label: 'Realm' },
    { key: 'label', label: 'Label' },
    { key: 'createdAt', label: 'Created at' },
    { key: 'id', label: 'ID' },
  ] satisfies readonly OutputColumn[]
  return format === 'pretty'
    ? formatPrettyCollection(columns, rows)
    : formatTsv(columns, rows)
}
