import { ulid } from 'ulid'
import { CtxindexNotFoundError, CtxindexValidationError } from '../errors'
import type {
  AddOAuthClientInput,
  OAuthClientRecord,
  OAuthClientService,
  OAuthClientServiceDeps,
} from './types'

async function cleanup(
  store: OAuthClientServiceDeps['store'],
  refs: readonly string[],
): Promise<void> {
  for (const ref of refs) {
    try {
      await store.deleteSecret(ref)
    } catch {}
  }
}

export function createOAuthClientService(
  deps: OAuthClientServiceDeps,
): OAuthClientService {
  const now = deps.now ?? Date.now

  return {
    async addClient(input: AddOAuthClientInput): Promise<OAuthClientRecord> {
      const label = input.label ?? input.provider
      if (
        input.provider.trim().length === 0 ||
        label.trim().length === 0 ||
        input.clientId.length === 0
      ) {
        throw new CtxindexValidationError(
          'invalid_filter',
          'OAuth client provider, label, and client id must be nonempty',
        )
      }
      const collision = deps.db
        .prepare('SELECT 1 FROM oauth_clients WHERE provider = ? AND label = ?')
        .get(input.provider, label)
      if (collision) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `Client label "${label}" is already taken for provider "${input.provider}"; choose another with --label`,
        )
      }
      const timestamp = now()
      const refs: string[] = []
      const write = async (kind: string, value: string): Promise<string> => {
        const ref = await deps.store.setSecret(
          input.provider,
          `client:${label}:${kind}:${ulid()}`,
          value,
        )
        refs.push(ref)
        return ref
      }

      try {
        const clientIdRef = await write('client-id', input.clientId)
        const clientSecretRef = input.clientSecret
          ? await write('client-secret', input.clientSecret)
          : null
        deps.db
          .prepare(
            'INSERT INTO oauth_clients (provider, label, client_id_ref, client_secret_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(
            input.provider,
            label,
            clientIdRef,
            clientSecretRef,
            timestamp,
            timestamp,
          )
        return {
          provider: input.provider,
          label,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
      } catch (cause) {
        await cleanup(deps.store, refs)
        throw cause
      }
    },

    listClients(): OAuthClientRecord[] {
      const rows = deps.db
        .prepare(
          'SELECT provider, label, created_at, updated_at FROM oauth_clients ORDER BY provider, label',
        )
        .all() as {
        readonly provider: string
        readonly label: string
        readonly created_at: number
        readonly updated_at: number
      }[]
      return rows.map((row) => ({
        provider: row.provider,
        label: row.label,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    },

    async removeClient(provider: string, label: string): Promise<void> {
      const row = deps.db
        .prepare(
          'SELECT client_id_ref, client_secret_ref FROM oauth_clients WHERE provider = ? AND label = ?',
        )
        .get(provider, label) as {
        readonly client_id_ref: string
        readonly client_secret_ref: string | null
      } | null
      if (!row) {
        throw new CtxindexNotFoundError(
          `OAuth client not found: provider "${provider}", label "${label}"`,
        )
      }
      deps.db
        .prepare('DELETE FROM oauth_clients WHERE provider = ? AND label = ?')
        .run(provider, label)
      await cleanup(
        deps.store,
        [row.client_id_ref, row.client_secret_ref].filter(
          (ref): ref is string => ref !== null,
        ),
      )
    },
  }
}
