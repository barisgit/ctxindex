import type { UpsertAccountInput } from '../account'
import type { Logger } from '../logger'
import type { CompleteRegistry } from '../registry'
import type { SecretsStore } from '../secrets'
import type { CtxindexDatabase } from '../storage'

export interface GrantRow {
  readonly id: string
  readonly accountId: string
  readonly provider: string
  readonly accountLabel: string | null
  readonly scopes: readonly string[]
  readonly accessTokenRef: string | null
  readonly refreshTokenRef: string | null
  readonly appConfigRef: string
  readonly expiresAt: number | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface AddGrantInput {
  readonly provider: string
  readonly account: Omit<UpsertAccountInput, 'provider'>
  readonly scopes: readonly string[]
  readonly appConfig: Readonly<Record<string, unknown>>
  readonly accessToken?: string
  readonly refreshToken: string
  readonly expiresAt?: number
}

export interface AddGrantResult {
  readonly grantId: string
  readonly accountId: string
}

export interface AuthDependencies {
  readonly db: CtxindexDatabase
  readonly store: SecretsStore
  readonly logger: Logger
  readonly registry: CompleteRegistry
  readonly readEnvironment?: (name: string) => string | undefined
  readonly now?: () => number
}

export interface AuthService {
  addGrant(input: AddGrantInput): Promise<AddGrantResult>
  removeAccount(label: string): Promise<void>
  getGrantById(grantId: string): Promise<GrantRow | null>
  listGrants(provider?: string): Promise<readonly GrantRow[]>
  resolveLinkedGrantAccessToken(
    grantId: string,
    options?: { readonly forceRefresh?: boolean },
  ): Promise<string>
  refreshAccessToken(grantId: string): Promise<string>
}
