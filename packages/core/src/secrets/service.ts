import { CtxindexValidationError } from '../errors'
import type { Logger } from '../logger'
import type { CtxindexDatabase } from '../storage'
import type { SecretBackend, SecretsStore } from './types'
import { parseSecretRef } from './types'

const secretColumns = [
  'client_id_ref',
  'client_secret_ref',
  'access_token_ref',
  'refresh_token_ref',
] as const

type SecretColumn = (typeof secretColumns)[number]

interface GrantSecretRow {
  readonly id: string
  readonly provider: string
  readonly client_id_ref: string | null
  readonly client_secret_ref: string | null
  readonly access_token_ref: string | null
  readonly refresh_token_ref: string | null
}

export interface SecretsServiceDeps {
  readonly db: CtxindexDatabase
  readonly fileStore: SecretsStore
  readonly keychainStore?: SecretsStore
  readonly logger: Logger
  readonly paths?: unknown
  readonly backend?: SecretBackend
}

export interface SecretsMigrationResult {
  readonly moved: number
}

export interface SecretsStatus {
  readonly backend: SecretBackend
  readonly keyCount: number
}

export interface SecretsService {
  migrateSecrets(target: SecretBackend): Promise<SecretsMigrationResult>
  getSecretsStatus(): Promise<SecretsStatus>
}

function storeForBackend(
  deps: SecretsServiceDeps,
  backend: SecretBackend,
): SecretsStore {
  if (backend === 'file') return deps.fileStore
  if (deps.keychainStore) return deps.keychainStore
  throw new CtxindexValidationError(
    'invalid_filter',
    'keychain store is required for keychain secrets migration',
  )
}

function scopeForRef(row: GrantSecretRow, ref: string): string {
  const parsed = parseSecretRef(ref)
  return parsed.backend === 'keychain' ? parsed.scope : row.provider
}

function keyForRef(ref: string): string {
  const parsed = parseSecretRef(ref)
  return parsed.key
}

function getGrantSecretRows(deps: SecretsServiceDeps): GrantSecretRow[] {
  return deps.db
    .prepare(
      `SELECT id, provider, client_id_ref, client_secret_ref, access_token_ref, refresh_token_ref
       FROM grants`,
    )
    .all() as GrantSecretRow[]
}

function updateGrantRef(
  deps: SecretsServiceDeps,
  grantId: string,
  column: SecretColumn,
  ref: string,
): void {
  deps.db
    .prepare(`UPDATE grants SET ${column} = ? WHERE id = ?`)
    .run(ref, grantId)
}

function updateGrantRefs(
  deps: SecretsServiceDeps,
  refs: Map<string, string>,
): void {
  if (refs.size === 0) return
  for (const row of getGrantSecretRows(deps)) {
    for (const column of secretColumns) {
      const nextRef = row[column] ? refs.get(row[column]) : undefined
      if (nextRef) updateGrantRef(deps, row.id, column, nextRef)
    }
  }
}

async function migrateStoreEntries(
  deps: SecretsServiceDeps,
  target: SecretBackend,
): Promise<number> {
  const current = deps.backend ?? target
  if (current === target) return 0
  const sourceStore = storeForBackend(deps, current)
  const targetStore = storeForBackend(deps, target)
  const refs = new Map<string, string>()

  for (const entry of await sourceStore.listKeys()) {
    const value = await sourceStore.getSecret(entry.ref)
    refs.set(
      entry.ref,
      await targetStore.setSecret(entry.scope, entry.key, value),
    )
  }

  updateGrantRefs(deps, refs)
  for (const ref of refs.keys()) await sourceStore.deleteSecret(ref)
  return refs.size
}

export function createSecretsService(deps: SecretsServiceDeps): SecretsService {
  return {
    async migrateSecrets(
      target: SecretBackend,
    ): Promise<SecretsMigrationResult> {
      let moved = await migrateStoreEntries(deps, target)
      const oldRefs: string[] = []

      for (const row of getGrantSecretRows(deps)) {
        for (const column of secretColumns) {
          const ref = row[column]
          if (!ref) continue
          const parsed = parseSecretRef(ref)
          if (parsed.backend === target) continue

          const sourceStore = storeForBackend(deps, parsed.backend)
          const targetStore = storeForBackend(deps, target)
          const value = await sourceStore.getSecret(ref)
          const nextRef = await targetStore.setSecret(
            scopeForRef(row, ref),
            keyForRef(ref),
            value,
          )
          updateGrantRef(deps, row.id, column, nextRef)
          oldRefs.push(ref)
          moved += 1
        }
      }

      for (const ref of oldRefs) {
        await storeForBackend(deps, parseSecretRef(ref).backend).deleteSecret(
          ref,
        )
      }

      deps.logger.debug({ moved, target }, 'secrets migrated')
      return { moved }
    },

    async getSecretsStatus(): Promise<SecretsStatus> {
      const backend = deps.backend ?? 'file'
      const rows = getGrantSecretRows(deps)
      const keyCount = rows.reduce((count, row) => {
        return (
          count +
          secretColumns.filter((column) => {
            const ref = row[column]
            return ref ? parseSecretRef(ref).backend === backend : false
          }).length
        )
      }, 0)
      return { backend, keyCount }
    },
  }
}

export async function migrateSecrets(
  deps: SecretsServiceDeps,
  target: SecretBackend,
): Promise<SecretsMigrationResult> {
  return createSecretsService(deps).migrateSecrets(target)
}

export async function getSecretsStatus(
  deps: SecretsServiceDeps,
): Promise<SecretsStatus> {
  return createSecretsService(deps).getSecretsStatus()
}
