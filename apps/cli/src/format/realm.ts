import type { RealmRow } from '@ctxindex/core/realm'

export function formatRealmAdded(slug: string): string {
  return `realm added: ${slug}`
}

export function formatRealms(
  realms: RealmRow[],
  opts: { readonly json: boolean },
): string {
  if (opts.json) return JSON.stringify(realms, null, 2)
  return realms
    .map((realm) => `${realm.slug}${realm.is_default ? ' (default)' : ''}`)
    .join('\n')
}
