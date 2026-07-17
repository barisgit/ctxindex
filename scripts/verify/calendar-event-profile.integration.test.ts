import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import {
  getSourceResource,
  LocalSearchExecutor,
  RelationStore,
  ResourceStore,
} from '@ctxindex/core'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'
import {
  defineAdapter,
  defineExtension,
  type RetrieveContext,
} from '@ctxindex/extension-sdk'
import {
  calendarEventProfile,
  calendarEventRef,
} from '@ctxindex/profiles/calendar-event'
import { z } from 'zod'

const googleSourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const microsoftSourceId = '01KXHBNECDAH1T4MJ38X88EPFK'
const sharedProviderEventId = 'Case/Sensitive shared event'
const databases: Database[] = []

const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const authService = {
  async resolveLinkedGrantAccessToken() {
    throw new Error('unauthenticated fake Adapter must not resolve a Grant')
  },
}

function fakeCalendarAdapter(
  id: string,
  provider: string,
  onRetrieve: () => void,
) {
  return defineAdapter({
    id,
    version: 1,
    configSchema: z.object({}).strict(),
    auth: { kind: 'none' },
    profiles: [{ id: 'calendar.event', version: 1 }],
    routing: 'indexed',
    capabilities: ['retrieve'],
    operations: {
      retrieve(context: RetrieveContext) {
        onRetrieve()
        context.emitResource({
          ref: context.ref,
          profile: { id: 'calendar.event', version: 1 },
          payload: {
            provider,
            providerCalendarId: 'calendar-1',
            providerEventId: 'retrieved-event',
            timing: {
              kind: 'timed',
              start: '2026-08-02T09:00:00Z',
              end: '2026-08-02T10:00:00Z',
            },
            title: 'Provider-retrieved Calendar Event',
            status: 'confirmed',
          },
        })
      },
    },
    actions: {},
  })
}

async function setup(retrieveCalls = { google: 0, microsoft: 0 }) {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('realm-personal', 'personal', NULL, 1)")
  db.exec("INSERT INTO realms VALUES ('realm-work', 'work', NULL, 1)")
  const insertSource = db.prepare(
    'INSERT INTO sources (id, realm_id, label, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  insertSource.run(
    googleSourceId,
    'realm-personal',
    'Google Calendar Fixture',
    'fake.google-calendar',
    1,
    '{}',
    1,
    1,
  )
  insertSource.run(
    microsoftSourceId,
    'realm-work',
    'Microsoft Calendar Fixture',
    'fake.microsoft-calendar',
    1,
    '{}',
    1,
    1,
  )
  databases.push(db)
  const registry = createExtensionRegistry([
    defineExtension({
      id: 'ctxindex.calendar-profile.integration',
      version: 1,
      profiles: [calendarEventProfile],
      adapters: [
        fakeCalendarAdapter('fake.google-calendar', 'google', () => {
          retrieveCalls.google += 1
        }),
        fakeCalendarAdapter('fake.microsoft-calendar', 'microsoft', () => {
          retrieveCalls.microsoft += 1
        }),
      ],
    }),
  ])
  return {
    db,
    registry,
    resources: new ResourceStore(db, registry.profiles),
    search: new LocalSearchExecutor(db, registry.profiles),
  }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

test('calendar.event uses generic registry, storage, search, exact Realm, and get paths', async () => {
  const { db, registry, resources, search } = await setup()
  const googleRef = calendarEventRef(googleSourceId, sharedProviderEventId)
  const microsoftRef = calendarEventRef(
    microsoftSourceId,
    sharedProviderEventId,
  )
  const base = {
    providerCalendarId: 'calendar-1',
    providerEventId: sharedProviderEventId,
    timing: {
      kind: 'timed' as const,
      start: '2026-08-01T09:00:00Z',
      end: '2026-08-01T10:00:00Z',
    },
    title: 'Shared roadmap planning',
    description: 'Coordinate the shared launch plan.',
    status: 'confirmed' as const,
    updatedAt: '2026-07-16T10:00:00Z',
  }
  const googlePayload = { ...base, provider: 'google' }
  const microsoftPayload = { ...base, provider: 'microsoft' }

  resources.upsert({
    ref: googleRef,
    sourceId: googleSourceId,
    profile: { id: 'calendar.event', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: googlePayload,
  })
  resources.upsert({
    ref: microsoftRef,
    sourceId: microsoftSourceId,
    profile: { id: 'calendar.event', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: microsoftPayload,
  })

  expect(googleRef).not.toBe(microsoftRef)
  expect(
    search.search({ text: 'shared launch' }).map(({ ref }) => ref),
  ).toEqual([googleRef, microsoftRef])
  expect(
    search
      .search({ text: 'shared', realms: ['personal'] })
      .map(({ ref, realm }) => ({ ref, realm })),
  ).toEqual([{ ref: googleRef, realm: 'personal' }])
  expect(
    search
      .search({
        text: 'shared',
        kind: 'events',
        fields: [{ name: 'provider', value: 'microsoft' }],
      })
      .map(({ ref }) => ref),
  ).toEqual([microsoftRef])

  const commonGetInput = {
    db,
    registry,
    authService,
    logger,
    signal: new AbortController().signal,
    fetch: async () => {
      throw new Error('hydrated generic get must not perform provider I/O')
    },
  }
  const google = await getSourceResource({
    ...commonGetInput,
    ref: googleRef,
  })
  const microsoft = await getSourceResource({
    ...commonGetInput,
    ref: microsoftRef,
  })

  expect(google.resource).toMatchObject({
    ref: googleRef,
    sourceId: googleSourceId,
    realmId: 'realm-personal',
    title: 'Shared roadmap planning',
    summary: 'Coordinate the shared launch plan.',
    profile: { id: 'calendar.event', version: 1 },
    payload: googlePayload,
  })
  expect(microsoft.resource).toMatchObject({
    ref: microsoftRef,
    sourceId: microsoftSourceId,
    realmId: 'realm-work',
    payload: microsoftPayload,
  })
  expect(google.warnings).toEqual([])
  expect(microsoft.warnings).toEqual([])

  expect(describeRegistry(registry).kinds).toEqual([
    expect.objectContaining({
      id: 'calendar.event',
      version: 1,
      aliases: ['events'],
    }),
  ])
})

test('generic get retrieves and caches an absent Calendar Event through its owning Adapter', async () => {
  const calls = { google: 0, microsoft: 0 }
  const { db, registry } = await setup(calls)
  const ref = calendarEventRef(googleSourceId, 'retrieved-event')
  const input = {
    db,
    ref,
    registry,
    authService,
    logger,
    signal: new AbortController().signal,
  }

  const retrieved = await getSourceResource(input)
  const cached = await getSourceResource(input)

  expect(calls).toEqual({ google: 1, microsoft: 0 })
  expect(retrieved.resource).toMatchObject({
    ref,
    sourceId: googleSourceId,
    origin: 'adhoc',
    title: 'Provider-retrieved Calendar Event',
    profile: { id: 'calendar.event', version: 1 },
    payload: {
      provider: 'google',
      providerEventId: 'retrieved-event',
    },
  })
  expect(cached.resource).toEqual(retrieved.resource)
})

test('series Relations resolve only to each occurrence own Source Ref', async () => {
  const { db, resources } = await setup()
  const relations = new RelationStore(db)
  const timing = {
    kind: 'timed' as const,
    start: '2026-08-03T09:00:00Z',
    end: '2026-08-03T10:00:00Z',
  }
  const upsertPair = (sourceId: string, provider: string) => {
    const seriesRef = calendarEventRef(sourceId, 'shared-series')
    const series = resources.upsert({
      ref: seriesRef,
      sourceId,
      profile: { id: 'calendar.event', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: {
        provider,
        providerCalendarId: 'calendar-1',
        providerEventId: 'shared-series',
        timing,
        status: 'confirmed',
        recurrenceRules: ['RRULE:FREQ=WEEKLY'],
      },
    })
    const occurrence = resources.upsert({
      ref: calendarEventRef(sourceId, 'shared-occurrence'),
      sourceId,
      profile: { id: 'calendar.event', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: {
        provider,
        providerCalendarId: 'calendar-1',
        providerEventId: 'shared-occurrence',
        timing,
        status: 'confirmed',
        series: {
          providerEventId: 'shared-series',
          ref: seriesRef,
          originalStart: { kind: 'timed', at: timing.start },
        },
      },
    })
    return { series, occurrence }
  }

  const google = upsertPair(googleSourceId, 'google')
  const microsoft = upsertPair(microsoftSourceId, 'microsoft')

  expect(relations.list(google.occurrence.resourceId)[0]).toMatchObject({
    relation: 'series',
    target: { ref: calendarEventRef(googleSourceId, 'shared-series') },
    resolvedResourceIds: [google.series.resourceId],
  })
  expect(relations.list(microsoft.occurrence.resourceId)[0]).toMatchObject({
    relation: 'series',
    target: { ref: calendarEventRef(microsoftSourceId, 'shared-series') },
    resolvedResourceIds: [microsoft.series.resourceId],
  })
})
