import { describe, expect, spyOn, test } from 'bun:test'
import { CtxindexNotFoundError } from '@ctxindex/core/errors'
import type { ThreadResult } from '@ctxindex/core/thread'
import {
  formatThreadJson,
  formatThreadPretty,
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

const directDaemon = {
  select: () => null,
  get: async () => {
    throw new Error('daemon transport invoked')
  },
}

describe('thread output', () => {
  test('formats complete deterministic text rows and narrow pretty cards', () => {
    const text = formatThreadText(result)
    expect(text).toContain('depth\tref\tsourceId\trealmId\tprofile')
    expect(text).toContain(`0\t${ref}`)
    expect(text).toContain('{"body":"full payload"}')
    expect(text).toContain(`1\t${childRef}`)
    const pretty = formatThreadPretty(result, { columns: 40 })
    expect(
      pretty.split('\n').every((line) => Bun.stringWidth(line) <= 40),
    ).toBe(true)
    expect(pretty).not.toContain('…')
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

    expect(
      await handleThreadGetCommand({ ref, format: 'json' }, open, directDaemon),
    ).toBe(0)
    expect(log).toHaveBeenCalledWith(formatThreadJson(result))
    expect(closed).toBe(true)
    log.mockRestore()
  })

  test('selected daemon thread preserves output without opening direct dependencies', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let opened = false
    try {
      const exit = await handleThreadGetCommand(
        { ref, format: 'json' },
        async () => {
          opened = true
          throw new Error('direct dependencies opened')
        },
        {
          select: () => {
            throw new Error('legacy selection invoked')
          },
          ensure: async () => ({
            status: 'selected',
            selection: {} as never,
            started: true,
          }),
          get: async () => result as never,
        },
      )
      expect(exit).toBe(0)
      expect(opened).toBe(false)
      expect(log).toHaveBeenCalledWith(formatThreadJson(result))
    } finally {
      log.mockRestore()
    }
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

    expect(
      await handleThreadGetCommand(
        { ref: 'bad-ref', format: 'text' },
        open,
        directDaemon,
      ),
    ).toBe(2)
    expect(opens).toBe(0)
    expect(
      await handleThreadGetCommand({ ref, format: 'text' }, open, directDaemon),
    ).toBe(2)
    expect(opens).toBe(1)
    error.mockRestore()
  })
})
