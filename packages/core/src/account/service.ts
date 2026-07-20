import { ulid } from 'ulid'
import { CtxindexValidationError } from '../errors'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type {
  AccountExpiryState,
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
  readonly label: string
}

interface InventoryRow {
  readonly accountId: string
  readonly provider: string
  readonly label: string
  readonly grantId: string | null
  readonly expiresAt: number | null
  readonly sourceId: string | null
  readonly sourceLabel: string | null
  readonly adapterId: string | null
  readonly realmId: string | null
  readonly realmSlug: string | null
  readonly realmLabel: string | null
}

interface MutableInventoryItem extends Omit<AccountInventoryItem, 'sources'> {
  readonly sources: AccountInventorySource[]
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
  if (input.label !== undefined && !isNonemptyString(input.label)) {
    throw new CtxindexValidationError(
      'invalid_account_identity',
      'Account label must be nonempty',
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
        let account = deps.db
          .prepare(
            'SELECT id, label FROM accounts WHERE provider = ? AND external_user_id = ?',
          )
          .get(input.provider, input.externalUserId) as AccountIdRow | null
        const label = input.label ?? account?.label
        if (label === undefined) {
          throw new CtxindexValidationError(
            'invalid_account_identity',
            'Account label must be supplied for a new Account',
          )
        }
        const conflict = deps.db
          .prepare('SELECT id FROM accounts WHERE label = ? AND id != ?')
          .get(label, account?.id ?? '') as { readonly id: string } | null
        if (conflict) {
          throw new CtxindexValidationError(
            'invalid_filter',
            `Account label "${label}" is already taken; choose another with --label`,
          )
        }

        if (!account) {
          const accountId = ulid(timestamp)
          deps.db
            .prepare(
              `INSERT INTO accounts
                 (id, provider, label, external_user_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              accountId,
              input.provider,
              label,
              input.externalUserId,
              timestamp,
              timestamp,
            )
          account = { id: accountId, label }
        }

        if (input.label !== undefined) {
          deps.db
            .prepare(
              'UPDATE accounts SET label = ?, updated_at = ? WHERE id = ?',
            )
            .run(input.label, timestamp, account.id)
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
             g.expires_at AS expiresAt,
             s.id AS sourceId,
             s.label AS sourceLabel,
             s.adapter_id AS adapterId,
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
      const currentTime = now()

      for (const row of rows) {
        let account = inventory.get(row.accountId)
        if (!account) {
          account = {
            id: row.accountId,
            provider: row.provider,
            label: row.label,
            expiresAt: row.expiresAt,
            expiryState: expiryState(row.expiresAt, currentTime),
            sources: [],
          }
          inventory.set(row.accountId, account)
        }
        if (row.grantId === null) continue
        if (
          row.sourceId === null ||
          row.sourceLabel === null ||
          row.adapterId === null ||
          row.realmId === null ||
          row.realmSlug === null
        ) {
          continue
        }
        const source: AccountInventorySource = {
          id: row.sourceId,
          label: row.sourceLabel,
          adapter: { id: row.adapterId },
          realm: {
            id: row.realmId,
            slug: row.realmSlug,
            label: row.realmLabel,
          },
        }
        account.sources.push(source)
      }

      const result = [...inventory.values()]
      for (const account of result) {
        account.sources.sort(compareById)
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
