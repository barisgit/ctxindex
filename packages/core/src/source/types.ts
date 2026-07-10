import type { Logger } from '../logger'
import type { RealmService } from '../realm'
import type { CtxindexDatabase } from '../storage'

export interface SourceRow {
  readonly id: string
  readonly realm_id: string
  readonly realm_slug?: string
  readonly adapter_id: string
  readonly display_name: string | null
  readonly config_json: string | null
  readonly grant_id?: string | null
  readonly created_at: number
  readonly last_status?: string | null
  readonly last_run_at?: number | null
  readonly errors_count?: number | null
  readonly items_count?: number
  readonly chunks_count?: number
  readonly sample_uri?: string | null
  readonly account_email?: string | null
}

export interface AddSourceInput {
  readonly adapterId: string
  readonly realmSlug?: string
  readonly displayName?: string
  readonly configJson?: string
  readonly grantId?: string
}

export interface AddSourceResult {
  readonly sourceId: string
  readonly realmId: string
}

export interface ListSourcesInput {
  readonly realmSlug?: string
}

export interface StatusRow {
  readonly sourceId: string
  readonly adapterId: string
  readonly realmSlug: string
  readonly lastStatus: string
  readonly lastRunAt: number | null
  readonly errorsCount: number
  readonly lastError: string | null
  readonly cursor: unknown
}

export interface SourceServiceDeps {
  readonly db: CtxindexDatabase
  readonly logger: Logger
  readonly realmService?: RealmService
}

export interface SourceService {
  addSource(input: AddSourceInput): AddSourceResult
  listSources(input?: ListSourcesInput): SourceRow[]
  findSourceById(sourceId: string): SourceRow | null
  removeSource(sourceId: string): void
  bindGrantToSource(sourceId: string, grantId: string): void
  getStatus(input?: { sourceId?: string }): StatusRow[]
}
