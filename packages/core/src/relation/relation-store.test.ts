import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { defineProfile } from '@ctxindex/extension-sdk'
import { communicationMessageProfile } from '@ctxindex/profiles'
import { z } from 'zod'
import { createProfileRegistry } from '../registry/profile-registry'
import { ResourceStore } from '../resource/resource-store'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { RelationStore } from './relation-store'

const sourceA = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const sourceB = '01ARZ3NDEKTSV4RRFFQ69G5FAW'
const sourceRef = `ctx://${sourceA}/messages/source`
const targetRef = `ctx://${sourceB}/messages/target`
const dbs: Database[] = []

const profile = defineProfile({
  id: 'fake.message',
  version: 1,
  schema: z.object({ messageId: z.string(), body: z.string() }),
  search: {
    fields: {
      internetMessageId: {
        type: 'string',
        extract: (payload) => payload.messageId,
      },
    },
    chunks: (payload) => [payload.body],
  },
})

test('communication.message Relations resolve lazily without collapsing cross-Source identities', async () => {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('personal', 'personal', NULL, 1)")
  db.exec("INSERT INTO realms VALUES ('work', 'work', NULL, 1)")
  const insertSource = db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  insertSource.run(sourceA, 'personal', 'gmail', 1, '{}', 1, 1)
  insertSource.run(sourceB, 'work', 'gmail', 1, '{}', 1, 1)
  dbs.push(db)
  const resources = new ResourceStore(
    db,
    createProfileRegistry([communicationMessageProfile]),
  )
  const relations = new RelationStore(db)
  const upsert = (
    sourceId: string,
    providerMessageId: string,
    payload: {
      conversationKey: string
      rfcMessageId: string
      inReplyTo?: string
    },
  ) =>
    resources.upsert({
      ref: `ctx://${sourceId}/message/${providerMessageId}`,
      sourceId,
      profile: { id: 'communication.message', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: { providerMessageId, ...payload },
    })

  const child = await upsert(sourceA, 'child', {
    conversationKey: `${sourceA}:provider-thread`,
    rfcMessageId: '<child@example.com>',
    inReplyTo: '<parent@example.com>',
  })
  expect(
    relations.list(child.resourceId).find((edge) => edge.relation === 'parent'),
  ).toMatchObject({ resolvedResourceIds: [] })

  const parentA = await upsert(sourceA, 'parent-a', {
    conversationKey: `${sourceA}:provider-thread`,
    rfcMessageId: '<parent@example.com>',
  })
  expect(relations.traverse(child.resourceId, 'parent', 'outgoing')).toEqual([
    { resourceId: parentA.resourceId, direction: 'outgoing' },
  ])
  expect(
    relations.traverse(child.resourceId, 'conversation', 'outgoing'),
  ).toEqual(
    expect.arrayContaining([
      { resourceId: child.resourceId, direction: 'outgoing' },
      { resourceId: parentA.resourceId, direction: 'outgoing' },
    ]),
  )

  const parentB = await upsert(sourceB, 'parent-b', {
    conversationKey: `${sourceB}:provider-thread`,
    rfcMessageId: '<parent@example.com>',
  })
  expect(relations.traverse(child.resourceId, 'parent', 'outgoing')).toEqual(
    expect.arrayContaining([
      { resourceId: parentA.resourceId, direction: 'outgoing' },
      { resourceId: parentB.resourceId, direction: 'outgoing' },
    ]),
  )
  expect(
    relations.traverse(child.resourceId, 'parent', 'outgoing'),
  ).toHaveLength(2)
  expect(
    relations.traverse(child.resourceId, 'conversation', 'outgoing'),
  ).not.toContainEqual({
    resourceId: parentB.resourceId,
    direction: 'outgoing',
  })
  expect(parentA.resourceId).not.toBe(parentB.resourceId)
})

async function setup() {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('personal', 'personal', NULL, 1)")
  db.exec("INSERT INTO realms VALUES ('work', 'work', NULL, 1)")
  const insertSource = db.prepare(
    'INSERT INTO sources (id, realm_id, adapter_id, adapter_version, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  insertSource.run(sourceA, 'personal', 'fake', 1, '{}', 1, 1)
  insertSource.run(sourceB, 'work', 'fake', 1, '{}', 1, 1)
  dbs.push(db)
  return {
    db,
    resources: new ResourceStore(db, createProfileRegistry([profile])),
    relations: new RelationStore(db),
  }
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

test('natural-key Relations remain observable and resolve lazily after target arrival', async () => {
  const { resources, relations } = await setup()
  const source = await resources.upsert({
    ref: sourceRef,
    sourceId: sourceA,
    profile: { id: 'fake.message', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: { messageId: '<source@example>', body: 'source' },
  })
  await relations.replace(source.resourceId, [
    {
      relation: 'parent',
      target: { field: 'internetMessageId', value: '<target@example>' },
    },
    {
      relation: 'conversation',
      target: { field: 'internetMessageId', value: '<missing@example>' },
    },
  ])

  expect(relations.list(source.resourceId)).toEqual([
    expect.objectContaining({ relation: 'parent', resolvedResourceIds: [] }),
    expect.objectContaining({
      relation: 'conversation',
      resolvedResourceIds: [],
    }),
  ])

  const target = await resources.upsert({
    ref: targetRef,
    sourceId: sourceB,
    profile: { id: 'fake.message', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: { messageId: '<target@example>', body: 'target' },
  })

  expect(relations.traverse(source.resourceId, 'parent', 'outgoing')).toEqual([
    { resourceId: target.resourceId, direction: 'outgoing' },
  ])
  expect(relations.traverse(target.resourceId, 'parent', 'incoming')).toEqual([
    { resourceId: source.resourceId, direction: 'incoming' },
  ])
  expect(
    relations
      .list(source.resourceId)
      .find((edge) => edge.relation === 'conversation'),
  ).toMatchObject({
    resolvedResourceIds: [],
  })
})

test('Ref Relations resolve and inverse traversal excludes tombstoned targets by default', async () => {
  const { resources, relations } = await setup()
  const source = await resources.upsert({
    ref: sourceRef,
    sourceId: sourceA,
    profile: { id: 'fake.message', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: { messageId: '<source@example>', body: 'source' },
  })
  const target = await resources.upsert({
    ref: targetRef,
    sourceId: sourceB,
    profile: { id: 'fake.message', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: { messageId: '<target@example>', body: 'target' },
  })
  await relations.replace(source.resourceId, [
    { relation: 'related', target: { ref: targetRef } },
  ])
  expect(relations.traverse(target.resourceId, 'related', 'incoming')).toEqual([
    { resourceId: source.resourceId, direction: 'incoming' },
  ])

  await resources.remove({ ref: targetRef, sourceId: sourceB, deletedAt: 100 })
  expect(relations.traverse(source.resourceId, 'related', 'outgoing')).toEqual(
    [],
  )
  expect(
    relations.traverse(source.resourceId, 'related', 'outgoing', {
      includeDeleted: true,
    }),
  ).toEqual([{ resourceId: target.resourceId, direction: 'outgoing' }])
})

test('natural keys resolve globally to multiple live Resources and refresh after deletion', async () => {
  const { db, resources, relations } = await setup()
  const source = await resources.upsert({
    ref: sourceRef,
    sourceId: sourceA,
    profile: { id: 'fake.message', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: { messageId: '<source@example>', body: 'source' },
  })
  const first = await resources.upsert({
    ref: targetRef,
    sourceId: sourceB,
    profile: { id: 'fake.message', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: { messageId: '<shared@example>', body: 'first' },
  })
  const secondRef = `ctx://${sourceA}/messages/second`
  const second = await resources.upsert({
    ref: secondRef,
    sourceId: sourceA,
    profile: { id: 'fake.message', version: 1 },
    origin: 'adhoc',
    completeness: 'complete',
    payload: { messageId: '<shared@example>', body: 'second' },
  })
  await relations.replace(source.resourceId, [
    {
      relation: 'same',
      target: { field: 'internetMessageId', value: '<shared@example>' },
    },
  ])

  expect(relations.traverse(source.resourceId, 'same', 'both')).toEqual(
    expect.arrayContaining([
      { resourceId: first.resourceId, direction: 'outgoing' },
      { resourceId: second.resourceId, direction: 'outgoing' },
    ]),
  )
  expect(relations.traverse(source.resourceId, 'same', 'both')).toHaveLength(2)
  resources.remove({ ref: targetRef, sourceId: sourceB, deletedAt: 10 })
  resources.remove({ ref: secondRef, sourceId: sourceA, deletedAt: 10 })
  expect(relations.traverse(source.resourceId, 'same', 'outgoing')).toEqual([])
  expect(
    relations.traverse(source.resourceId, 'same', 'outgoing', {
      includeDeleted: true,
    }),
  ).toEqual([{ resourceId: first.resourceId, direction: 'outgoing' }])
  expect(
    db
      .prepare(
        "SELECT value_text FROM field_index WHERE resource_id = ? AND field = 'internetMessageId'",
      )
      .get(first.resourceId),
  ).toEqual({ value_text: '<shared@example>' })
  expect(db.prepare('SELECT count(*) AS count FROM relations').get()).toEqual({
    count: 1,
  })
})
