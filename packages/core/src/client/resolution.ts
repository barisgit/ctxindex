import { CtxindexValidationError } from '../errors'
import type { OAuthClientServiceDeps } from './types'

interface OAuthClientSecretRow {
  readonly provider: string
  readonly label: string
  readonly clientIdRef: string
  readonly clientSecretRef: string | null
}

export interface ResolveOAuthClientInput {
  readonly provider: string
  readonly label?: string
}

export interface ResolvedOAuthClient {
  readonly provider: string
  readonly label: string
  readonly clientId: string
  readonly clientSecret?: string
}

export async function resolveOAuthClient(
  input: ResolveOAuthClientInput,
  deps: Pick<OAuthClientServiceDeps, 'db' | 'store'>,
): Promise<ResolvedOAuthClient> {
  const clients = deps.db
    .prepare(
      'SELECT provider, label, client_id_ref AS clientIdRef, client_secret_ref AS clientSecretRef FROM oauth_clients WHERE provider = ? ORDER BY label',
    )
    .all(input.provider) as OAuthClientSecretRow[]
  if (clients.length === 0) {
    throw new CtxindexValidationError(
      'invalid_filter',
      `No OAuth client configured for provider "${input.provider}"; run: bun cli client add ${input.provider} --from-env`,
    )
  }

  const selected =
    input.label === undefined
      ? clients.length === 1
        ? clients[0]
        : undefined
      : clients.find((client) => client.label === input.label)
  if (!selected) {
    const labels = clients.map((client) => client.label).join(', ')
    throw new CtxindexValidationError(
      'invalid_filter',
      input.label === undefined
        ? `Multiple OAuth clients are configured for provider "${input.provider}"; choose one with --client. Available labels: ${labels}`
        : `OAuth client "${input.label}" is not configured for provider "${input.provider}". Available labels: ${labels}`,
    )
  }

  const clientId = await deps.store.getSecret(selected.clientIdRef)
  const clientSecret = selected.clientSecretRef
    ? await deps.store.getSecret(selected.clientSecretRef)
    : undefined
  return {
    provider: selected.provider,
    label: selected.label,
    clientId,
    ...(clientSecret === undefined ? {} : { clientSecret }),
  }
}
