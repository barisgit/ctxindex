import { ulid } from 'ulid'
import { CtxindexValidationError } from '../errors'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type {
  AccountExpiryState,
  AccountInventoryGrant,
  AccountInventoryItem,
  AccountInventorySource,
  AccountService,
  AccountServiceDeps,
  UpsertAccountInput,
  UpsertAccountResult,
  VerifiedAccountIdentityInput,
} from './types'

interface AccountIdRow {
  readonly id: string
}

interface InventoryRow {
  readonly accountId: string
  readonly provider: string
  readonly label: string | null
  readonly grantId: string | null
  readonly scopesJson: string | null
  readonly expiresAt: number | null
  readonly sourceId: string | null
  readonly displayName: string | null
  readonly adapterId: string | null
  readonly adapterVersion: number | null
  readonly realmId: string | null
  readonly realmSlug: string | null
  readonly realmLabel: string | null
}

interface MutableInventoryGrant extends Omit<AccountInventoryGrant, 'sources'> {
  readonly sources: AccountInventorySource[]
}

interface MutableInventoryItem extends Omit<AccountInventoryItem, 'grants'> {
  readonly grants: MutableInventoryGrant[]
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateIdentity(
  identity: unknown,
): identity is VerifiedAccountIdentityInput {
  return (
    identity !== null &&
    typeof identity === 'object' &&
    isNonemptyString((identity as { kind?: unknown }).kind) &&
    isNonemptyString((identity as { value?: unknown }).value)
  )
}

function assertValidUpsertInput(input: UpsertAccountInput): void {
  if (!isNonemptyString(input.provider)) {
    throw new CtxindexValidationError(
      'invalid_account_identity',
      'Account provider must be nonempty',
    )
  }
  if (!isNonemptyString(input.externalUserId)) {
    throw new CtxindexValidationError(
      'invalid_account_identity',
      'Account external user id must be nonempty',
    )
  }
  if (
    !Array.isArray(input.verifiedIdentities) ||
    !input.verifiedIdentities.every(validateIdentity)
  ) {
    throw new CtxindexValidationError(
      'invalid_account_identity',
      'Verified Account identities must have nonempty kind and value',
    )
  }
}

export function normalizeGrantScopes(scopes: unknown): readonly string[] {
  let values: readonly unknown[]
  if (Array.isArray(scopes)) {
    values = scopes
  } else if (typeof scopes === 'string') {
    const trimmed = scopes.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        values = Array.isArray(parsed) ? parsed : []
      } catch {
        values = []
      }
    } else {
      values = trimmed.split(/\s+/)
    }
  } else {
    values = []
  }

  return [
    ...new Set(
      values.filter(
        (scope): scope is string =>
          typeof scope === 'string' && scope.length > 0,
      ),
    ),
  ].sort(compareUnicodeCodePoints)
}

function compareById(
  left: { readonly id: string },
  right: { readonly id: string },
): number {
  return compareUnicodeCodePoints(left.id, right.id)
}

function expiryState(
  expiresAt: number | null,
  now: number,
): AccountExpiryState {
  if (expiresAt === null) return 'unknown'
  return expiresAt <= now ? 'expired' : 'active'
}

export function createAccountService(deps: AccountServiceDeps): AccountService {
  const now = deps.now ?? Date.now

  return {
    upsertAccount(input: UpsertAccountInput): UpsertAccountResult {
      assertValidUpsertInput(input)
      const timestamp = now()

      return deps.db.transaction(() => {
        deps.db
          .prepare(
            `INSERT OR IGNORE INTO accounts
               (id, provider, label, external_user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            ulid(timestamp),
            input.provider,
            input.label ?? null,
            input.externalUserId,
            timestamp,
            timestamp,
          )

        const account = deps.db
          .prepare(
            'SELECT id FROM accounts WHERE provider = ? AND external_user_id = ?',
          )
          .get(input.provider, input.externalUserId) as AccountIdRow | null
        if (!account) throw new Error('Account upsert failed')

        if (input.label !== undefined) {
          deps.db
            .prepare(
              'UPDATE accounts SET label = ?, updated_at = ? WHERE id = ?',
            )
            .run(input.label ?? null, timestamp, account.id)
        }

        const insertIdentity = deps.db.prepare(
          `INSERT OR IGNORE INTO account_identities
             (id, account_id, kind, value, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        for (const identity of input.verifiedIdentities) {
          insertIdentity.run(
            ulid(timestamp),
            account.id,
            identity.kind,
            identity.value,
            timestamp,
          )
        }

        return { accountId: account.id }
      })()
    },

    listAccountInventory(): AccountInventoryItem[] {
      const rows = deps.db
        .prepare(
          `SELECT
             a.id AS accountId,
             a.provider,
             a.label,
             g.id AS grantId,
             g.scopes_json AS scopesJson,
             g.expires_at AS expiresAt,
             s.id AS sourceId,
             s.display_name AS displayName,
             s.adapter_id AS adapterId,
             s.adapter_version AS adapterVersion,
             r.id AS realmId,
             r.slug AS realmSlug,
             r.label AS realmLabel
           FROM accounts AS a
           LEFT JOIN grants AS g ON g.account_id = a.id
           LEFT JOIN sources AS s ON s.grant_id = g.id
           LEFT JOIN realms AS r ON r.id = s.realm_id`,
        )
        .all() as InventoryRow[]
      const inventory = new Map<string, MutableInventoryItem>()
      const grants = new Map<string, MutableInventoryGrant>()
      const currentTime = now()

      for (const row of rows) {
        let account = inventory.get(row.accountId)
        if (!account) {
          account = {
            id: row.accountId,
            provider: row.provider,
            label: row.label,
            grants: [],
          }
          inventory.set(row.accountId, account)
        }
        if (row.grantId === null || row.scopesJson === null) continue

        let grant = grants.get(row.grantId)
        if (!grant) {
          grant = {
            id: row.grantId,
            scopes: normalizeGrantScopes(row.scopesJson),
            expiresAt: row.expiresAt,
            expiryState: expiryState(row.expiresAt, currentTime),
            sources: [],
          }
          account.grants.push(grant)
          grants.set(row.grantId, grant)
        }
        if (
          row.sourceId === null ||
          row.adapterId === null ||
          row.adapterVersion === null ||
          row.realmId === null ||
          row.realmSlug === null
        ) {
          continue
        }
        const source: AccountInventorySource = {
          id: row.sourceId,
          displayName: row.displayName,
          adapter: { id: row.adapterId, version: row.adapterVersion },
          realm: {
            id: row.realmId,
            slug: row.realmSlug,
            label: row.realmLabel,
          },
        }
        grant.sources.push(source)
      }

      const result = [...inventory.values()]
      for (const account of result) {
        account.grants.sort(compareById)
        for (const grant of account.grants) {
          grant.sources.sort(compareById)
        }
      }
      return result.sort((left, right) => {
        const providerOrder = compareUnicodeCodePoints(
          left.provider,
          right.provider,
        )
        return providerOrder === 0 ? compareById(left, right) : providerOrder
      })
    },
  }
}
