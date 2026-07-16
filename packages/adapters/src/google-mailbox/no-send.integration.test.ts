import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { describeAction, runAction } from '@ctxindex/core/action'
import type { AuthService } from '@ctxindex/core/auth'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'
import { CTXINDEX_BUILTIN_EXTENSIONS } from '../builtins'
import { buildGmailDraftRaw } from './draft'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const actionIds = [
  'communication.message.draft.create',
  'communication.message.draft.update',
]
const unknownSendActionIds = [
  'communication.message.draft.send',
  'communication.message.send',
]
const scopes = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
]
const registry = createExtensionRegistry(CTXINDEX_BUILTIN_EXTENSIONS)
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const stateTables = [
  'resources',
  'field_index',
  'chunks',
  'relations',
  'relation_resolutions',
  'artifacts',
  'source_sync_state',
  'sync_runs',
  'sync_run_checkpoints',
  'sync_locks',
] as const
const dbs: Database[] = []

afterEach(() => {
  for (const db of dbs.splice(0)) db.close(false)
})

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.prepare(
    "INSERT INTO realms (id, slug, label, created_at) VALUES ('realm-1', 'work', 'Work', 1)",
  ).run()
  db.prepare(
    "INSERT INTO accounts (id, provider, label, created_at, updated_at) VALUES ('account-1', 'google', 'Test', 1, 1)",
  ).run()
  db.prepare(
    `INSERT INTO grants (id, account_id, provider, scopes_json, created_at, updated_at)
     VALUES ('grant-1', 'account-1', 'google', ?, 1, 1)`,
  ).run(JSON.stringify(scopes))
  db.prepare(
    `INSERT INTO sources
       (id, realm_id, adapter_id, adapter_version, grant_id, config_json, sync_enabled, created_at, updated_at)
     VALUES (?, 'realm-1', 'google.mailbox', 1, 'grant-1', '{}', 1, 1, 1)`,
  ).run(sourceId)
  return db
}

function stateCounts(
  db: Database,
): Record<(typeof stateTables)[number], number> {
  return Object.fromEntries(
    stateTables.map((table) => [
      table,
      (
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number
        }
      ).count,
    ]),
  ) as Record<(typeof stateTables)[number], number>
}

function emptyStateCounts(): Record<(typeof stateTables)[number], number> {
  return Object.fromEntries(stateTables.map((table) => [table, 0])) as Record<
    (typeof stateTables)[number],
    number
  >
}

describe('V1 Draft Action negative contract', () => {
  test('exposes exactly the reversible Draft create/update whitelist', async () => {
    const db = await freshDb()
    const description = describeRegistry(registry)
    const profileActionIds = registry.profiles
      .list()
      .flatMap((profile) => Object.keys(profile.actions ?? {}))
    const adapterBindings = registry.adapters
      .list()
      .flatMap((adapter) =>
        Object.keys(adapter.actions).map((id) => ({ adapter: adapter.id, id })),
      )
    const describedActionIds = description.actions.map((action) => action.id)

    expect(profileActionIds).toEqual(actionIds)
    expect(describedActionIds).toEqual(actionIds)
    expect(describedActionIds).toEqual([...describedActionIds].sort())
    expect(adapterBindings).toEqual(
      actionIds.map((id) => ({ adapter: 'google.mailbox', id })),
    )
    expect(description.actions.map((action) => action.effect)).toEqual([
      'reversible',
      'reversible',
    ])

    const selectedDescriptions = actionIds.map((actionId) =>
      describeAction({ db, registry, actionId, sourceId }),
    )
    expect(
      selectedDescriptions.map(({ id, effect, sources }) => ({
        id,
        effect,
        sources,
      })),
    ).toEqual(
      actionIds.map((id) => ({
        id,
        effect: 'reversible',
        sources: [
          {
            id: sourceId,
            adapter: { id: 'google.mailbox', version: 1 },
            available: true,
          },
        ],
      })),
    )

    const affordanceSurface = [
      ...description.actions.flatMap(({ id, docs }) => [id, docs]),
      ...adapterBindings.map(({ adapter, id }) => `${adapter}:${id}`),
    ].join('\n')
    expect(affordanceSurface).not.toMatch(/send|irrevers/i)
  })

  test.each(
    unknownSendActionIds,
  )('rejects unknown send-like Action %s before Source, auth, provider, or state', async (actionId) => {
    const db = await freshDb()
    let tokenCalls = 0
    const providerRequests: string[] = []
    const authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'> = {
      async resolveLinkedGrantAccessToken() {
        tokenCalls += 1
        return 'must-not-resolve'
      },
    }

    let describeError: unknown
    try {
      describeAction({
        db,
        registry,
        actionId,
        sourceId: 'source-does-not-exist',
      })
    } catch (caught) {
      describeError = caught
    }
    expect(describeError).toBeInstanceOf(CtxindexValidationError)
    expect(describeError).toMatchObject({ code: 'unknown_action' })

    const error = await runAction({
      db,
      registry,
      authService,
      logger,
      actionId,
      sourceId: 'source-does-not-exist',
      actionInput: {},
      signal: new AbortController().signal,
      fetch: (async (input: Parameters<typeof fetch>[0]) => {
        providerRequests.push(input.toString())
        throw new Error('must not fetch')
      }) as unknown as typeof fetch,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CtxindexValidationError)
    expect(error).toMatchObject({ code: 'unknown_action' })
    expect({ tokenCalls, providerRequests }).toEqual({
      tokenCalls: 0,
      providerRequests: [],
    })
    expect(stateCounts(db)).toEqual(emptyStateCounts())
  })

  test('composing valid text and describing Actions creates no Draft or provider state', async () => {
    const db = await freshDb()
    const providerRequests: string[] = []

    const raw = buildGmailDraftRaw({
      to: ['recipient@example.com'],
      subject: 'Composed only in memory',
      bodyText: 'This text is not a Draft until runAction persists it.',
    })
    const registryDescription = describeRegistry(registry)
    const actionDescriptions = actionIds.map((actionId) =>
      describeAction({ db, registry, actionId, sourceId }),
    )

    expect(raw).toBeString()
    expect(raw.length).toBeGreaterThan(0)
    expect(registryDescription.actions.map(({ id }) => id)).toEqual(actionIds)
    expect(actionDescriptions.map(({ id }) => id)).toEqual(actionIds)
    expect(providerRequests).toEqual([])
    expect(stateCounts(db)).toEqual(emptyStateCounts())
  })
})
