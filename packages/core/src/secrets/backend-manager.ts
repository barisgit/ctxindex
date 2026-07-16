import { CtxindexValidationError } from '../errors'
import type { Logger } from '../logger'
import type { CtxindexDatabase } from '../storage'
import {
  CtxindexSecretsError,
  parseSecretRef,
  type SecretBackend,
  type SecretsStore,
} from './types'

const secretColumns = [
  'client_id_ref',
  'client_secret_ref',
  'access_token_ref',
  'refresh_token_ref',
] as const

type SecretEntry = {
  readonly ref: string
  readonly scope: string
  readonly key: string
}

type GrantSecretRow = {
  readonly id: string
  readonly client_id_ref: string | null
  readonly client_secret_ref: string | null
  readonly access_token_ref: string | null
  readonly refresh_token_ref: string | null
}

export interface SecretBackendManagerDeps {
  readonly db: CtxindexDatabase
  readonly fileStore: SecretsStore
  readonly keychainStore: SecretsStore
  readonly logger: Logger
  readonly backend: SecretBackend
  readonly commitBackend: (target: SecretBackend) => Promise<void>
}

export interface SecretBackendStatus {
  readonly backend: SecretBackend
  readonly backends: Readonly<
    Record<
      SecretBackend,
      { readonly available: boolean; readonly referenceCount: number }
    >
  >
}

export interface SecretBackendSwitchResult {
  readonly backend: SecretBackend
  readonly copied: number
  readonly cleaned: number
  readonly cleanupPending: boolean
  readonly warnings: readonly string[]
}

export interface SecretBackendManager {
  getStatus(): Promise<SecretBackendStatus>
  switchBackend(target: SecretBackend): Promise<SecretBackendSwitchResult>
}

function storeForBackend(
  deps: SecretBackendManagerDeps,
  backend: SecretBackend,
): SecretsStore {
  return backend === 'file' ? deps.fileStore : deps.keychainStore
}

function otherBackend(backend: SecretBackend): SecretBackend {
  return backend === 'file' ? 'keychain' : 'file'
}

function grantRows(deps: SecretBackendManagerDeps): GrantSecretRow[] {
  return deps.db
    .prepare(
      `SELECT id, client_id_ref, client_secret_ref, access_token_ref, refresh_token_ref
       FROM grants
       ORDER BY id`,
    )
    .all() as GrantSecretRow[]
}

function referencedRefs(rows: readonly GrantSecretRow[]): string[] {
  const refs = new Set<string>()
  for (const row of rows) {
    for (const column of secretColumns) {
      const ref = row[column]
      if (ref) refs.add(ref)
    }
  }
  return [...refs].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
}

function referenceCounts(
  rows: readonly GrantSecretRow[],
): Record<SecretBackend, number> {
  const counts: Record<SecretBackend, number> = { file: 0, keychain: 0 }
  for (const row of rows) {
    for (const column of secretColumns) {
      const ref = row[column]
      if (ref) counts[parseSecretRef(ref).backend] += 1
    }
  }
  return counts
}

async function storeAvailable(store: SecretsStore): Promise<boolean> {
  try {
    await prepareStore(store)
    return true
  } catch {
    return false
  }
}

async function prepareStore(store: SecretsStore): Promise<void> {
  const probe = (
    store as SecretsStore & { probeAvailable?: () => Promise<void> }
  ).probeAvailable
  if (probe) await probe.call(store)
  else await store.listKeys()
}

function updateReferences(
  deps: SecretBackendManagerDeps,
  refs: ReadonlyMap<string, string>,
): void {
  if (refs.size === 0) return
  const update = deps.db.transaction(() => {
    for (const row of grantRows(deps)) {
      for (const column of secretColumns) {
        const current = row[column]
        const next = current ? refs.get(current) : undefined
        if (next && next !== current) {
          deps.db
            .prepare(`UPDATE grants SET ${column} = ? WHERE id = ?`)
            .run(next, row.id)
        }
      }
    }
  })
  update()
}

function assertBackend(value: SecretBackend): void {
  if (value !== 'file' && value !== 'keychain') {
    throw new CtxindexValidationError(
      'invalid_filter',
      'secret backend must be file or keychain',
    )
  }
}

export function createSecretBackendManager(
  deps: SecretBackendManagerDeps,
): SecretBackendManager {
  let backend = deps.backend

  return {
    async getStatus(): Promise<SecretBackendStatus> {
      const rows = grantRows(deps)
      const counts = referenceCounts(rows)
      const [fileAvailable, keychainAvailable] = await Promise.all([
        storeAvailable(deps.fileStore),
        storeAvailable(deps.keychainStore),
      ])
      return {
        backend,
        backends: {
          file: {
            available: fileAvailable,
            referenceCount: counts.file,
          },
          keychain: {
            available: keychainAvailable,
            referenceCount: counts.keychain,
          },
        },
      }
    },

    async switchBackend(
      target: SecretBackend,
    ): Promise<SecretBackendSwitchResult> {
      assertBackend(target)
      const source = otherBackend(target)
      const sourceStore = storeForBackend(deps, source)
      const targetStore = storeForBackend(deps, target)
      const rows = grantRows(deps)
      const sourceRefs = referencedRefs(rows).filter(
        (ref) => parseSecretRef(ref).backend === source,
      )

      if (backend === source) await sourceStore.listKeys()
      await prepareStore(targetStore)

      let sourceEntries: SecretEntry[]
      try {
        sourceEntries = await sourceStore.listKeys()
      } catch (cause) {
        if (backend === source || sourceRefs.length > 0) throw cause
        await deps.commitBackend(target)
        backend = target
        const warning = 'inactive secret backend cleanup remains pending'
        deps.logger.warn({ source, target }, warning)
        return {
          backend: target,
          copied: 0,
          cleaned: 0,
          cleanupPending: true,
          warnings: [warning],
        }
      }

      sourceEntries.sort((left, right) =>
        left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0,
      )
      const byRef = new Map(sourceEntries.map((entry) => [entry.ref, entry]))
      for (const ref of sourceRefs) {
        if (!byRef.has(ref)) {
          throw new CtxindexSecretsError(
            'a referenced source secret is missing from its backend index',
            'not_found',
          )
        }
      }

      const prepared = await Promise.all(
        sourceEntries.map(async (entry) => ({
          entry,
          value: await sourceStore.getSecret(entry.ref),
        })),
      )
      const replacements = new Map<string, string>()
      for (const item of prepared) {
        const nextRef = await targetStore.setSecret(
          item.entry.scope,
          item.entry.key,
          item.value,
        )
        if ((await targetStore.getSecret(nextRef)) !== item.value) {
          throw new CtxindexSecretsError(
            'target secret verification failed',
            'io',
          )
        }
        replacements.set(item.entry.ref, nextRef)
      }

      updateReferences(deps, replacements)
      await deps.commitBackend(target)
      backend = target

      let cleaned = 0
      let cleanupFailures = 0
      for (const item of prepared) {
        try {
          await sourceStore.deleteSecret(item.entry.ref)
          cleaned += 1
        } catch {
          cleanupFailures += 1
        }
      }
      const warnings =
        cleanupFailures === 0
          ? []
          : [
              `${cleanupFailures} source secret ${cleanupFailures === 1 ? 'copy' : 'copies'} could not be cleaned up`,
            ]
      if (warnings.length > 0) {
        deps.logger.warn(
          { source, target, cleanupFailures },
          'secret backend switched with cleanup pending',
        )
      }

      return {
        backend: target,
        copied: prepared.length,
        cleaned,
        cleanupPending: warnings.length > 0,
        warnings,
      }
    },
  }
}
