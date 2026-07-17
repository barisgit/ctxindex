import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { applyPragmas, runMigrations } from '../storage'
import { createAccountService } from './service'

const dbs: Database[] = []
let db: Database

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  dbs.push(db)
})

afterEach(() => {
  for (const database of dbs.splice(0)) database.close()
})

function service(now = 1_000) {
  return createAccountService({ db, now: () => now })
}

function counts() {
  return {
    accounts: (
      db.prepare('SELECT count(*) AS count FROM accounts').get() as {
        count: number
      }
    ).count,
    identities: (
      db.prepare('SELECT count(*) AS count FROM account_identities').get() as {
        count: number
      }
    ).count,
  }
}

describe('upsertAccount', () => {
  test('reuses one Account for the same provider subject and updates an explicitly supplied label', () => {
    const accounts = service()
    const first = accounts.upsertAccount({
      provider: 'google',
      externalUserId: 'stable-subject',
      label: 'Old label',
      verifiedIdentities: [{ kind: 'email', value: 'person@example.com' }],
    })
    const second = accounts.upsertAccount({
      provider: 'google',
      externalUserId: 'stable-subject',
      label: 'New label',
      verifiedIdentities: [],
    })

    expect(second).toEqual(first)
    expect(
      db
        .prepare('SELECT id, provider, label, external_user_id FROM accounts')
        .all(),
    ).toEqual([
      {
        id: first.accountId,
        provider: 'google',
        label: 'New label',
        external_user_id: 'stable-subject',
      },
    ])

    accounts.upsertAccount({
      provider: 'google',
      externalUserId: 'stable-subject',
      verifiedIdentities: [],
    })
    expect(db.prepare('SELECT label FROM accounts').get()).toEqual({
      label: 'New label',
    })
  })

  test('deduplicates duplicate identity inputs and repeated authorization', () => {
    const accounts = service()
    const input = {
      provider: 'google',
      externalUserId: 'subject',
      label: 'person@example.com',
      verifiedIdentities: [
        { kind: 'email', value: 'person@example.com' },
        { kind: 'email', value: 'person@example.com' },
        { kind: 'principal', value: 'person@example.com' },
      ],
    } as const

    accounts.upsertAccount(input)
    accounts.upsertAccount(input)

    expect(
      db
        .prepare('SELECT kind, value FROM account_identities ORDER BY kind')
        .all(),
    ).toEqual([
      { kind: 'email', value: 'person@example.com' },
      { kind: 'principal', value: 'person@example.com' },
    ])
  })

  test('rejects a label already held by another provider Account', () => {
    const accounts = service()
    accounts.upsertAccount({
      provider: 'google',
      externalUserId: 'google-subject',
      label: 'person@example.com',
      verifiedIdentities: [],
    })

    expect(() =>
      accounts.upsertAccount({
        provider: 'microsoft',
        externalUserId: 'microsoft-subject',
        label: 'person@example.com',
        verifiedIdentities: [],
      }),
    ).toThrow(
      'Account label "person@example.com" is already taken; choose another with --label',
    )
    expect(counts().accounts).toBe(1)
  })

  test('rejects malformed provider, stable subject, or verified identity before writes', () => {
    const accounts = service()
    const malformed = [
      { provider: '', externalUserId: 'subject', verifiedIdentities: [] },
      { provider: '   ', externalUserId: 'subject', verifiedIdentities: [] },
      { provider: 'google', externalUserId: '', verifiedIdentities: [] },
      { provider: 'google', externalUserId: '   ', verifiedIdentities: [] },
      {
        provider: 'google',
        externalUserId: 'subject',
        verifiedIdentities: [{ kind: '', value: 'person@example.com' }],
      },
      {
        provider: 'google',
        externalUserId: 'subject',
        verifiedIdentities: [{ kind: 'email', value: '   ' }],
      },
    ]

    for (const input of malformed) {
      expect(() => accounts.upsertAccount(input)).toThrow()
      try {
        accounts.upsertAccount(input)
      } catch (error) {
        expect(error).toMatchObject({ code: 'invalid_account_identity' })
      }
      expect(counts()).toEqual({ accounts: 0, identities: 0 })
    }
  })

  test('composes inside an outer Grant transaction and rolls back with it', () => {
    const accounts = service()
    const persistAuthorization = db.transaction(() => {
      accounts.upsertAccount({
        provider: 'google',
        externalUserId: 'stable-subject',
        label: 'Person',
        verifiedIdentities: [{ kind: 'email', value: 'person@example.com' }],
      })
      throw new Error('Grant insert failed')
    })

    expect(persistAuthorization).toThrow('Grant insert failed')
    expect(counts()).toEqual({ accounts: 0, identities: 0 })
  })

  test('rolls back a new Account when identity insertion fails', () => {
    db.exec(`
      CREATE TRIGGER reject_identity BEFORE INSERT ON account_identities
      WHEN new.value = 'reject@example.com'
      BEGIN
        SELECT RAISE(ABORT, 'identity rejected');
      END;
    `)

    expect(() =>
      service().upsertAccount({
        provider: 'google',
        externalUserId: 'stable-subject',
        label: 'Person',
        verifiedIdentities: [
          { kind: 'email', value: 'accepted@example.com' },
          { kind: 'email', value: 'reject@example.com' },
        ],
      }),
    ).toThrow('identity rejected')
    expect(counts()).toEqual({ accounts: 0, identities: 0 })
  })

  test('rolls back label and identities on failure for an existing Account', () => {
    const accounts = service()
    const { accountId } = accounts.upsertAccount({
      provider: 'google',
      externalUserId: 'stable-subject',
      label: 'Original',
      verifiedIdentities: [{ kind: 'email', value: 'original@example.com' }],
    })
    db.exec(`
      CREATE TRIGGER reject_identity BEFORE INSERT ON account_identities
      WHEN new.value = 'reject@example.com'
      BEGIN
        SELECT RAISE(ABORT, 'identity rejected');
      END;
    `)

    expect(() =>
      accounts.upsertAccount({
        provider: 'google',
        externalUserId: 'stable-subject',
        label: 'Changed',
        verifiedIdentities: [
          { kind: 'email', value: 'new@example.com' },
          { kind: 'email', value: 'reject@example.com' },
        ],
      }),
    ).toThrow('identity rejected')
    expect(db.prepare('SELECT id, label FROM accounts').get()).toEqual({
      id: accountId,
      label: 'Original',
    })
    expect(
      db.prepare('SELECT kind, value FROM account_identities').all(),
    ).toEqual([{ kind: 'email', value: 'original@example.com' }])
  })
})

describe('listAccountInventory', () => {
  test('returns deterministic nested safe inventory and omits unauthenticated Sources', () => {
    const accounts = service(2_000)
    const later = accounts.upsertAccount({
      provider: '𐀀-provider',
      externalUserId: 'secret-subject-later',
      label: 'Later',
      verifiedIdentities: [
        { kind: 'email', value: 'secret-later@example.com' },
      ],
    }).accountId
    const earlier = accounts.upsertAccount({
      provider: '\uE000-provider',
      externalUserId: 'secret-subject-earlier',
      label: 'Earlier',
      verifiedIdentities: [
        { kind: 'email', value: 'secret-earlier@example.com' },
      ],
    }).accountId

    db.exec(`
      INSERT INTO realms (id, slug, label, created_at) VALUES
        ('realm-z', '𐀀-realm', 'Realm later', 1),
        ('realm-a', '\uE000-realm', 'Realm earlier', 1);
      INSERT INTO grants (id, account_id, provider, scopes_json, access_token_ref, expires_at, created_at, updated_at) VALUES
        ('grant-empty', '${earlier}', '\uE000-provider', '["scope-z","scope-a","scope-a"]', 'keychain:secret-empty', NULL, 1, 1),
        ('grant-active', '${later}', '𐀀-provider', '["𐀀","\uE000"]', 'keychain:secret-active', 2001, 1, 1);
      INSERT INTO sources (id, realm_id, adapter_id, adapter_version, grant_id, label, config_json, created_at, updated_at) VALUES
        ('𐀀-source', 'realm-z', '𐀀-adapter', 2, 'grant-active', 'Later source', '{}', 1, 1),
        ('\uE000-source', 'realm-a', '\uE000-adapter', 1, 'grant-active', 'Earlier source', '{}', 1, 1),
        ('local-source', 'realm-a', 'local-directory', 1, NULL, 'Local', '{"path":"/sensitive"}', 1, 1);
    `)

    expect(accounts.listAccountInventory()).toEqual([
      {
        id: earlier,
        provider: '\uE000-provider',
        label: 'Earlier',
        grants: [
          {
            id: 'grant-empty',
            scopes: ['scope-a', 'scope-z'],
            expiresAt: null,
            expiryState: 'unknown',
            sources: [],
          },
        ],
      },
      {
        id: later,
        provider: '𐀀-provider',
        label: 'Later',
        grants: [
          {
            id: 'grant-active',
            scopes: ['\uE000', '𐀀'],
            expiresAt: 2001,
            expiryState: 'active',
            sources: [
              {
                id: '\uE000-source',
                label: 'Earlier source',
                adapter: { id: '\uE000-adapter', version: 1 },
                realm: {
                  id: 'realm-a',
                  slug: '\uE000-realm',
                  label: 'Realm earlier',
                },
              },
              {
                id: '𐀀-source',
                label: 'Later source',
                adapter: { id: '𐀀-adapter', version: 2 },
                realm: { id: 'realm-z', slug: '𐀀-realm', label: 'Realm later' },
              },
            ],
          },
        ],
      },
    ])
  })
})
