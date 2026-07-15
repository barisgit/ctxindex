import { describe, expect, spyOn, test } from 'bun:test'
import { CtxindexNotFoundError } from '@ctxindex/core/errors'
import type { ThreadResult } from '@ctxindex/core/thread'
import {
  formatThreadJson,
  formatThreadText,
  handleThreadGetCommand,
} from './thread'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const ref = `ctx://${sourceId}/message/one`
const childRef = `ctx://${sourceId}/message/two`
const result: ThreadResult = {
  mode: 'tree',
  messages: [
    {
      resource: {
        ref,
        sourceId,
        realmId: 'realm-1',
        profile: { id: 'fake.entry', version: 1 },
        origin: 'synced',
        title: 'Root',
        summary: null,
        occurredAt: 1,
        providerUpdatedAt: null,
        deletedAt: null,
        hydratedAt: 1,
        payload: { body: 'full payload' },
        createdAt: 1,
        updatedAt: 1,
      },
      children: [
        {
          resource: {
            ref: childRef,
            sourceId,
            realmId: 'realm-1',
            profile: { id: 'fake.entry', version: 1 },
            origin: 'synced',
            title: null,
            summary: null,
            occurredAt: 2,
            providerUpdatedAt: null,
            deletedAt: null,
            hydratedAt: 2,
            payload: { body: 'child payload' },
            createdAt: 2,
            updatedAt: 2,
          },
          children: [],
        },
      ],
    },
  ],
  warnings: [],
}

describe('thread output', () => {
  test('formats deterministic compact text with tree indentation', () => {
    expect(formatThreadText(result)).toBe(`${ref}\tRoot\n  ${childRef}`)
  })

  test('formats the typed JSON envelope with full Resource payloads', () => {
    expect(JSON.parse(formatThreadJson(result))).toEqual(result)
  })

  test('handler prints service output and closes dependencies', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let closed = false
    const open = async () => ({
      threadService: { get: () => result },
      async close() {
        closed = true
      },
    })

    expect(await handleThreadGetCommand(['--json', ref], open)).toBe(0)
    expect(log).toHaveBeenCalledWith(formatThreadJson(result))
    expect(closed).toBe(true)
    log.mockRestore()
  })

  test('malformed and unknown seeds use typed exit 2', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    let opens = 0
    const open = async () => {
      opens += 1
      return {
        threadService: {
          get() {
            throw new CtxindexNotFoundError('Resource not found')
          },
        },
        async close() {},
      }
    }

    expect(await handleThreadGetCommand(['bad-ref'], open)).toBe(2)
    expect(opens).toBe(0)
    expect(await handleThreadGetCommand([ref], open)).toBe(2)
    expect(opens).toBe(1)
    error.mockRestore()
  })
})
