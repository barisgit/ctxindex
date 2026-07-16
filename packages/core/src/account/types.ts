import type { CtxindexDatabase } from '../storage'

export interface VerifiedAccountIdentityInput {
  readonly kind: string
  readonly value: string
}

export interface UpsertAccountInput {
  readonly provider: string
  readonly externalUserId: string
  readonly label?: string
  readonly verifiedIdentities: readonly VerifiedAccountIdentityInput[]
}

export interface UpsertAccountResult {
  readonly accountId: string
}

export type AccountExpiryState = 'active' | 'expired' | 'unknown'

export interface AccountInventoryRealm {
  readonly id: string
  readonly slug: string
  readonly label: string | null
}

export interface AccountInventoryAdapter {
  readonly id: string
  readonly version: number
}

export interface AccountInventorySource {
  readonly id: string
  readonly displayName: string | null
  readonly adapter: AccountInventoryAdapter
  readonly realm: AccountInventoryRealm
}

export interface AccountInventoryGrant {
  readonly id: string
  readonly scopes: readonly string[]
  readonly expiresAt: number | null
  readonly expiryState: AccountExpiryState
  readonly sources: readonly AccountInventorySource[]
}

export interface AccountInventoryItem {
  readonly id: string
  readonly provider: string
  readonly label: string | null
  readonly grants: readonly AccountInventoryGrant[]
}

export interface AccountServiceDeps {
  readonly db: CtxindexDatabase
  readonly now?: () => number
}

export interface AccountService {
  upsertAccount(input: UpsertAccountInput): UpsertAccountResult
  listAccountInventory(): AccountInventoryItem[]
}
