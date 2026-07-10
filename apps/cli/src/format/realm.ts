import type { RealmRow } from '@ctxindex/core/realm'

export function formatRealmAdded(slug: string): string {
  return `realm added: ${slug}`
}

export function formatRealms(
  realms: RealmRow[],
  opts: { readonly json: boolean },
): string {
  if (opts.json) {
    // camelCase keys for consistency with status / search / auth JSON output.
    const rows = realms.map((realm) => ({
      id: realm.id,
      slug: realm.slug,
      isDefault: realm.is_default === 1,
      createdAt: realm.created_at,
    }))
    return JSON.stringify(rows, null, 2)
  }
  return realms
    .map((realm) => `${realm.slug}${realm.is_default ? ' (default)' : ''}`)
    .join('\n')
}
