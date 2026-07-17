import type { SecretsStore } from '../secrets'
import type { CtxindexDatabase } from '../storage'

export interface OAuthClientRecord {
  readonly provider: string
  readonly label: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface AddOAuthClientInput {
  readonly provider: string
  readonly label?: string
  readonly clientId: string
  readonly clientSecret?: string
}

export interface OAuthClientServiceDeps {
  readonly db: CtxindexDatabase
  readonly store: SecretsStore
  readonly now?: () => number
}

export interface OAuthClientService {
  addClient(input: AddOAuthClientInput): Promise<OAuthClientRecord>
  listClients(): OAuthClientRecord[]
  removeClient(provider: string, label: string): Promise<void>
}
