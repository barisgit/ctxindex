import type { OAuthAppInventoryItem } from '@ctxindex/core/oauth-app'

export function formatOAuthAppAdded(providerId: string, label: string): string {
  return `OAuth App added: ${providerId} ${JSON.stringify(label)}`
}

export function formatOAuthAppInventory(
  apps: readonly OAuthAppInventoryItem[],
  json: boolean,
): string {
  if (json) return JSON.stringify(apps, null, 2)
  if (apps.length === 0) return 'No OAuth Apps available.'
  return apps
    .map(
      (app) =>
        `${app.providerId} ${JSON.stringify(app.label)} origin=${app.origin}`,
    )
    .join('\n')
}

export function formatOAuthAppRemoved(
  providerId: string,
  label: string,
): string {
  return `OAuth App removed: ${providerId} ${JSON.stringify(label)}`
}
