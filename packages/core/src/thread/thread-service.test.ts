import { Database } from 'bun:sqlite'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { CtxindexNotFoundError, CtxindexValidationError } from '../errors'
import {
  createProfileRegistry,
  type ProfileRegistry,
} from '../registry/profile-registry'
import { ResourceStore } from '../resource/resource-store'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { createThreadService } from './thread-service'

const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const sourceA = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const sourceB = '01ARZ3NDEKTSV4RRFFQ69G5FAW'
const sourceC = '01ARZ3NDEKTSV4RRFFQ69G5FAX'
const dbs: Database[] = []

const communicationMessageTestProfile = defineProfile({
  id: 'communication.message',
  version: 1,
  schema: z.object({
    providerMessageId: z.string(),
    conversationKey: z.string().optional(),
    rfcMessageId: z.string().optional(),
    inReplyTo: z.string().optional(),
    date: z.string().optional(),
  }),
  search: {
    occurredAt: (payload) =>
      payload.date === undefined ? null : new Date(payload.date),
    fields: {
      conversationKey: {
        type: 'string',
        extract: (payload) => payload.conversationKey,
      },
      rfcMessageId: {
        type: 'string',
        extract: (payload) => payload.rfcMessageId,
      },
    },
  },
  relations: {
    conversation: (payload) =>
      payload.conversationKey
        ? { field: 'conversationKey', value: payload.conversationKey }
        : undefined,
    parent: (payload) =>
      payload.inReplyTo
        ? { field: 'rfcMessageId', value: payload.inReplyTo }
        : undefined,
  },
})

const profile = defineProfile({
  id: 'fake.entry',
  version: 1,
  schema: z.object({
    key: z.string(),
    group: z.string(),
    at: z.number(),
    parentKey: z.string().optional(),
  }),
  search: {
    occurredAt: (payload) => new Date(payload.at),
    fields: {
      key: { type: 'string', extract: (payload) => payload.key },
      group: { type: 'string', extract: (payload) => payload.group },
    },
  },
  relations: {
    conversation: (payload) => ({ field: 'group', value: payload.group }),
    parent: (payload) =>
      payload.parentKey
        ? { field: 'key', value: payload.parentKey }
        : undefined,
  },
})

type Entry = {
  readonly key: string
  readonly group: string
  readonly at: number
  readonly parentKey?: string
}

type Message = {
  readonly sourceId: string
  readonly key: string
  readonly providerMessageId?: string
  readonly conversationKey?: string
  readonly rfcMessageId?: string
  readonly inReplyTo?: string
  readonly date?: string
}

async function setupMessages(messages: readonly Message[]) {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec(`
    INSERT INTO realms VALUES ('personal', 'personal', NULL, 1);
    INSERT INTO realms VALUES ('work', 'work', NULL, 1);
    INSERT INTO realms VALUES ('archive', 'archive', NULL, 1);
  `)
  const insertSource = db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  insertSource.run(sourceA, 'personal', 'fake', 1, '{}', 1, 1)
  insertSource.run(sourceB, 'work', 'fake', 1, '{}', 1, 1)
  insertSource.run(sourceC, 'archive', 'fake', 1, '{}', 1, 1)
  dbs.push(db)
  const profiles = createProfileRegistry([communicationMessageTestProfile])
  const resources = new ResourceStore(db, profiles)
  for (const message of messages) {
    resources.upsert({
      ref: messageRef(message.sourceId, message.key),
      sourceId: message.sourceId,
      profile: {
        id: communicationMessageTestProfile.id,
        version: communicationMessageTestProfile.version,
      },
      origin: 'synced',
      completeness: 'complete',
      payload: {
        providerMessageId: message.providerMessageId ?? message.key,
        conversationKey: message.conversationKey,
        rfcMessageId: message.rfcMessageId,
        inReplyTo: message.inReplyTo,
        date: message.date,
      },
    })
  }
  return {
    resources,
    service: createThreadService({ db, profiles }),
  }
}

function messageRef(source: string, key: string): string {
  return `ctx://${source}/messages/${key}`
}

async function setup(
  entries: readonly Entry[],
  serviceProfiles?: ProfileRegistry,
) {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('realm', 'realm', NULL, 1)")
  db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(sourceId, 'realm', 'fake', 1, '{}', 1, 1)
  dbs.push(db)
  const profiles = createProfileRegistry([profile])
  const resources = new ResourceStore(db, profiles)
  for (const entry of entries) {
    resources.upsert({
      ref: ref(entry.key),
      sourceId,
      profile: { id: profile.id, version: profile.version },
      origin: 'synced',
      completeness: 'complete',
      payload: entry,
    })
  }
  return {
    db,
    resources,
    service: createThreadService({
      db,
      profiles: serviceProfiles ?? profiles,
    }),
  }
}

function ref(key: string): string {
  return `ctx://${sourceId}/entry/${key}`
}

interface RefNode {
  readonly ref: string
  readonly children: readonly RefNode[]
}

function refs(
  messages: readonly {
    resource: { ref: string }
    children: readonly unknown[]
  }[],
): readonly RefNode[] {
  return messages.map((node) => ({
    ref: node.resource.ref,
    children: refs(node.children as typeof messages),
  }))
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

test('out-of-order related Resources form the same tree from every seed', async () => {
  const { service } = await setup([
    { key: '3', group: 'group-1', at: 3, parentKey: '2' },
    { key: '1', group: 'group-1', at: 1 },
    { key: '2', group: 'group-1', at: 2, parentKey: '1' },
  ])
  const expected = [
    {
      ref: ref('1'),
      children: [
        {
          ref: ref('2'),
          children: [{ ref: ref('3'), children: [] }],
        },
      ],
    },
  ]

  for (const key of ['1', '2', '3']) {
    const result = service.get(ref(key))
    expect(result.mode).toBe('tree')
    expect(refs(result.messages)).toEqual(expected)
    expect(JSON.stringify(result)).not.toContain('resourceId')
    expect(
      result.messages.some((node) => Object.hasOwn(node.resource, 'id')),
    ).toBe(false)
  }
})

test('repeats conversation and bidirectional parent traversal until the closure is dry', async () => {
  const { service } = await setup([
    { key: 'a', group: 'left', at: 1 },
    { key: 'b', group: 'left', at: 2, parentKey: 'c' },
    { key: 'c', group: 'right', at: 3 },
    { key: 'd', group: 'right', at: 4 },
  ])

  for (const seed of ['a', 'c', 'd']) {
    const result = service.get(ref(seed))
    const allRefs = JSON.stringify(refs(result.messages))
    for (const key of ['a', 'b', 'c', 'd']) expect(allRefs).toContain(ref(key))
  }
})

test('keeps multiple roots and sorts roots and siblings by occurrence then Ref', async () => {
  const { service } = await setup([
    { key: 'child-z', group: 'g', at: 5, parentKey: 'root-a' },
    { key: 'root-z', group: 'g', at: 2 },
    { key: 'child-a', group: 'g', at: 4, parentKey: 'root-a' },
    { key: 'root-a', group: 'g', at: 1 },
  ])

  expect(refs(service.get(ref('child-z')).messages)).toEqual([
    {
      ref: ref('root-a'),
      children: [
        { ref: ref('child-a'), children: [] },
        { ref: ref('child-z'), children: [] },
      ],
    },
    { ref: ref('root-z'), children: [] },
  ])
})

test('returns a Source-scoped parentless conversation flat in date and Ref order', async () => {
  const conversationKey = `${sourceA}:thread-1`
  const { service } = await setupMessages([
    {
      sourceId: sourceA,
      key: 'undated',
      conversationKey,
      rfcMessageId: '<undated@example>',
    },
    {
      sourceId: sourceA,
      key: 'z-equal',
      conversationKey,
      rfcMessageId: '<z-equal@example>',
      date: '2026-01-02T00:00:00.000Z',
    },
    {
      sourceId: sourceA,
      key: 'dangling',
      conversationKey,
      rfcMessageId: '<dangling@example>',
      inReplyTo: '<missing@example>',
      date: '2026-01-01T00:00:00.000Z',
    },
    {
      sourceId: sourceA,
      key: 'a-equal',
      conversationKey,
      rfcMessageId: '<a-equal@example>',
      date: '2026-01-02T00:00:00.000Z',
    },
  ])

  const result = service.get(messageRef(sourceA, 'undated'))
  expect(result.mode).toBe('flat')
  expect(refs(result.messages)).toEqual([
    { ref: messageRef(sourceA, 'dangling'), children: [] },
    { ref: messageRef(sourceA, 'a-equal'), children: [] },
    { ref: messageRef(sourceA, 'z-equal'), children: [] },
    { ref: messageRef(sourceA, 'undated'), children: [] },
  ])
})

test('keeps cross-Source RFC Message-ID copies distinct and parents each child within its Source', async () => {
  const messages: Message[] = [
    {
      sourceId: sourceB,
      key: 'z-child',
      conversationKey: `${sourceB}:thread-1`,
      rfcMessageId: '<z-child@example>',
      inReplyTo: '<parent@example>',
      date: '2026-01-03T00:00:00.000Z',
    },
    {
      sourceId: sourceA,
      key: 'undated-child',
      conversationKey: `${sourceA}:thread-1`,
      rfcMessageId: '<undated-child@example>',
      inReplyTo: '<parent@example>',
    },
    {
      sourceId: sourceA,
      key: 'z-child',
      conversationKey: `${sourceA}:thread-1`,
      rfcMessageId: '<z-child@example>',
      inReplyTo: '<parent@example>',
      date: '2026-01-03T00:00:00.000Z',
    },
    {
      sourceId: sourceB,
      key: 'undated-child',
      conversationKey: `${sourceB}:thread-1`,
      rfcMessageId: '<undated-child@example>',
      inReplyTo: '<parent@example>',
    },
    {
      sourceId: sourceB,
      key: 'a-child',
      conversationKey: `${sourceB}:thread-1`,
      rfcMessageId: '<a-child@example>',
      inReplyTo: '<parent@example>',
      date: '2026-01-03T00:00:00.000Z',
    },
    {
      sourceId: sourceA,
      key: 'a-child',
      conversationKey: `${sourceA}:thread-1`,
      rfcMessageId: '<a-child@example>',
      inReplyTo: '<parent@example>',
      date: '2026-01-03T00:00:00.000Z',
    },
    {
      sourceId: sourceA,
      key: 'parent',
      conversationKey: `${sourceA}:thread-1`,
      rfcMessageId: '<parent@example>',
    },
    {
      sourceId: sourceB,
      key: 'parent',
      conversationKey: `${sourceB}:thread-1`,
      rfcMessageId: '<parent@example>',
      date: '2026-01-01T00:00:00.000Z',
    },
  ]
  const { service } = await setupMessages(messages)
  const expected = [
    {
      ref: messageRef(sourceB, 'parent'),
      children: [
        { ref: messageRef(sourceB, 'a-child'), children: [] },
        { ref: messageRef(sourceB, 'z-child'), children: [] },
        { ref: messageRef(sourceB, 'undated-child'), children: [] },
      ],
    },
    {
      ref: messageRef(sourceA, 'parent'),
      children: [
        { ref: messageRef(sourceA, 'a-child'), children: [] },
        { ref: messageRef(sourceA, 'z-child'), children: [] },
        { ref: messageRef(sourceA, 'undated-child'), children: [] },
      ],
    },
  ]

  for (const seed of [
    messageRef(sourceA, 'a-child'),
    messageRef(sourceB, 'undated-child'),
  ]) {
    const result = service.get(seed)
    expect(result.mode).toBe('tree')
    expect(refs(result.messages)).toEqual(expected)
  }
})

test('falls back to the lexical parent Ref when no same-Source copy exists', async () => {
  const { service } = await setupMessages([
    {
      sourceId: sourceC,
      key: 'child',
      rfcMessageId: '<child@example>',
      inReplyTo: '<shared-parent@example>',
      date: '2026-01-03T00:00:00.000Z',
    },
    {
      sourceId: sourceB,
      key: 'parent',
      rfcMessageId: '<shared-parent@example>',
      date: '2026-01-01T00:00:00.000Z',
    },
    {
      sourceId: sourceA,
      key: 'parent',
      rfcMessageId: '<shared-parent@example>',
      date: '2026-01-02T00:00:00.000Z',
    },
  ])

  expect(refs(service.get(messageRef(sourceC, 'child')).messages)).toEqual([
    { ref: messageRef(sourceB, 'parent'), children: [] },
    {
      ref: messageRef(sourceA, 'parent'),
      children: [{ ref: messageRef(sourceC, 'child'), children: [] }],
    },
  ])
})

test('excludes a tombstoned duplicate parent without losing a live cross-Source match', async () => {
  const { resources, service } = await setupMessages([
    {
      sourceId: sourceC,
      key: 'child',
      rfcMessageId: '<child@example>',
      inReplyTo: '<shared-parent@example>',
      date: '2026-01-02T00:00:00.000Z',
    },
    {
      sourceId: sourceA,
      key: 'parent',
      rfcMessageId: '<shared-parent@example>',
      date: '2026-01-01T00:00:00.000Z',
    },
    {
      sourceId: sourceB,
      key: 'parent',
      rfcMessageId: '<shared-parent@example>',
      date: '2026-01-01T00:00:00.000Z',
    },
  ])
  resources.remove({
    ref: messageRef(sourceA, 'parent'),
    sourceId: sourceA,
    deletedAt: 10,
  })

  expect(refs(service.get(messageRef(sourceC, 'child')).messages)).toEqual([
    {
      ref: messageRef(sourceB, 'parent'),
      children: [{ ref: messageRef(sourceC, 'child'), children: [] }],
    },
  ])
})

test('terminates cycles and breaks them deterministically in lexical child order', async () => {
  const { service } = await setup([
    { key: 'b', group: 'g', at: 2, parentKey: 'a' },
    { key: 'a', group: 'g', at: 1, parentKey: 'b' },
  ])
  const expected = [
    {
      ref: ref('b'),
      children: [{ ref: ref('a'), children: [] }],
    },
  ]

  expect(refs(service.get(ref('a')).messages)).toEqual(expected)
  expect(refs(service.get(ref('b')).messages)).toEqual(expected)
})

test('rejects malformed, absent, and tombstoned seeds and excludes related tombstones', async () => {
  const { resources, service } = await setup([
    { key: 'live', group: 'g', at: 1 },
    { key: 'deleted', group: 'g', at: 2 },
  ])
  resources.remove({ ref: ref('deleted'), sourceId, deletedAt: 10 })

  expect(() => service.get('not-a-ref')).toThrow(CtxindexValidationError)
  expect(() => service.get(ref('missing'))).toThrow(CtxindexNotFoundError)
  expect(() => service.get(ref('deleted'))).toThrow(CtxindexNotFoundError)
  expect(refs(service.get(ref('live')).messages)).toEqual([
    { ref: ref('live'), children: [] },
  ])
})

test('uses local rows only and deduplicates unknown Profile warnings', async () => {
  const unknownProfiles = createProfileRegistry([])
  const { db, service } = await setup(
    [
      { key: 'a', group: 'g', at: 1 },
      { key: 'b', group: 'g', at: 2 },
    ],
    unknownProfiles,
  )
  db.exec('UPDATE resources SET profile_version = 99')
  const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('provider access is forbidden'),
  )

  const result = service.get(ref('a'))
  expect(result.mode).toBe('flat')
  expect(result.messages).toHaveLength(2)
  expect(result.warnings).toEqual([
    {
      code: 'unknown_profile_version',
      profileId: 'fake.entry',
      profileVersion: 99,
    },
  ])
  expect(fetch).not.toHaveBeenCalled()
  fetch.mockRestore()
})
