import type { Logger } from '../logger'
import type { CtxindexDatabase } from '../storage'

export interface RealmRow {
  readonly id: string
  readonly slug: string
  readonly is_default: number
  readonly created_at: number
}

export interface CreateRealmInput {
  readonly slug: string
  readonly displayName?: string
  readonly isDefault?: boolean
}

export interface CreateRealmResult {
  readonly realmId: string
}

export interface RealmServiceDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
}

export interface RealmService {
  createRealm(input: CreateRealmInput): CreateRealmResult
  listRealms(): RealmRow[]
  getRealmBySlug(slug: string): RealmRow | null
  findRealmBySlug(slug: string): RealmRow | null
  deleteRealm(slug: string): void
}
