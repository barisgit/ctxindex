import { z } from 'zod'
import type { getEnv } from '../config'
import type { Logger } from '../logger'
import type { SecretsStore } from '../secrets'
import type { CtxindexDatabase as SqliteDatabase } from '../storage'

export type { SqliteDatabase }

export interface OAuthClientCreds {
  readonly clientId: string
  readonly clientSecret: string
}

export interface GoogleGrantRow {
  readonly id: string
  readonly accountId: string
  readonly provider: 'google'
  readonly scopes: string
  readonly accessTokenRef: string | null
  readonly refreshTokenRef: string | null
  readonly clientIdRef: string | null
  readonly clientSecretRef: string | null
  readonly expiresAt: number | null
  readonly createdAt: number
  readonly updatedAt: number
}

export interface GoogleGrantSummary {
  readonly id: string
  readonly provider: 'google'
  readonly scopes: string
  readonly expiresAt: number | null
  readonly accountEmail: string | null
  readonly accountDisplayName: string | null
}

export const GoogleTokenResponseSchema = z
  .object({
    access_token: z.string(),
    expires_in: z.number(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
    token_type: z.string().optional(),
  })
  .passthrough()

export type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>

export interface AuthDependencies {
  readonly db: SqliteDatabase
  readonly store: SecretsStore
  readonly logger: Logger
  readonly env: ReturnType<typeof getEnv>
}

export interface AddGoogleGrantInput {
  readonly clientId: string
  readonly clientSecret: string
  readonly refreshToken: string
  readonly accessToken?: string
  readonly scopes: string
  readonly expiresAt?: number
  readonly accountEmail?: string
}

export interface AddGoogleGrantResult {
  readonly grantId: string
  readonly accountId: string
}

export interface ExchangeAuthCodeInput {
  readonly clientId: string
  readonly clientSecret: string
  readonly code: string
  readonly redirectUri: string
}

export interface AuthService {
  addGoogleGrant(input: AddGoogleGrantInput): Promise<AddGoogleGrantResult>
  getActiveGoogleGrant(): Promise<GoogleGrantRow | null>
  getGoogleGrantById(grantId: string): Promise<GoogleGrantRow | null>
  listGoogleGrants(): Promise<GoogleGrantSummary[]>
  refreshGoogleAccessToken(grantId: string): Promise<string>
  exchangeGoogleAuthCode(
    input: ExchangeAuthCodeInput,
  ): Promise<GoogleTokenResponse>
}
