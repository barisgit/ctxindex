import { describe, expect, spyOn, test } from 'bun:test'
import type { SourceResourceResult } from '@ctxindex/core/source'
import { formatGetJson, formatGetText, handleGetCommand } from './get'

const result: SourceResourceResult = {
  resource: {
    id: 'resource-1',
    ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/item/one',
    sourceId: '01KXHBNECDAH1T4MJ38X88EPFJ',
    realmId: 'realm-1',
    profile: { id: 'fake.item', version: 1 },
    origin: 'synced',
    title: 'Title',
    summary: null,
    occurredAt: 123,
    providerUpdatedAt: 456,
    deletedAt: null,
    hydratedAt: 789,
    payload: { text: 'body' },
    createdAt: 1,
    updatedAt: 2,
  },
  warnings: [],
}

describe('get output', () => {
  test('formats deterministic JSON with the full Resource envelope', () => {
    expect(formatGetJson(result)).toBe(
      '{"resource":{"id":"resource-1","ref":"ctx://01KXHBNECDAH1T4MJ38X88EPFJ/item/one","sourceId":"01KXHBNECDAH1T4MJ38X88EPFJ","realmId":"realm-1","profile":{"id":"fake.item","version":1},"origin":"synced","title":"Title","summary":null,"occurredAt":123,"providerUpdatedAt":456,"deletedAt":null,"hydratedAt":789,"payload":{"text":"body"},"createdAt":1,"updatedAt":2},"warnings":[]}',
    )
  })

  test('formats concise text', () => {
    expect(formatGetText(result)).toBe(
      'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/item/one\tTitle',
    )
  })

  test('returns exit 2 for an invalid Ref before opening dependencies', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})

    expect(await handleGetCommand({ ref: 'not-a-ref', json: false })).toBe(2)
    expect(error).toHaveBeenCalledWith('get: invalid <ref>: not-a-ref')
    error.mockRestore()
  })

  test('selected daemon get preserves output without opening direct dependencies', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let opened = false
    try {
      const exit = await handleGetCommand(
        { ref: result.resource.ref, json: true },
        {
          selectDaemon: () => ({}) as never,
          get: async () => result as never,
          open: async () => {
            opened = true
            throw new Error('direct dependencies opened')
          },
        },
      )
      expect(exit).toBe(0)
      expect(opened).toBe(false)
      expect(log).toHaveBeenCalledWith(formatGetJson(result))
    } finally {
      log.mockRestore()
    }
  })

  test('direct get normalizes SIGINT to cancelled before local retrieval', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const exit = await handleGetCommand(
        { ref: result.resource.ref, json: false },
        {
          selectDaemon: () => null,
          get: async () => {
            throw new Error('daemon transport invoked')
          },
          open: async () => {
            process.emit('SIGINT')
            return {
              close: async () => {},
            } as never
          },
        },
      )

      expect(exit).toBe(130)
    } finally {
      process.removeAllListeners('SIGINT')
      error.mockRestore()
    }
  })
})
