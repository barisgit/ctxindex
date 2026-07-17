import type { OAuthClientRecord } from '@ctxindex/core/client'

export function formatClientAdded(client: OAuthClientRecord): string {
  return `client added: ${client.provider} ${JSON.stringify(client.label)}`
}

export function formatClientInventory(
  clients: readonly OAuthClientRecord[],
): string {
  if (clients.length === 0) return 'No OAuth clients configured.'
  return clients
    .map(
      (client) =>
        `${client.provider} ${JSON.stringify(client.label)} createdAt=${client.createdAt} updatedAt=${client.updatedAt}`,
    )
    .join('\n')
}

export function formatClientRemoved(provider: string, label: string): string {
  return `client removed: ${provider} ${JSON.stringify(label)}`
}
