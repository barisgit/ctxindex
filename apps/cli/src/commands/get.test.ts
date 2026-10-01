import { describe, expect, spyOn, test } from 'bun:test'
import type { SourceResourceResult } from '@ctxindex/core/source'
import {
  formatGetJson,
  formatGetPretty,
  formatGetText,
  handleGetCommand,
} from './get'

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

  test('formats the complete Resource envelope and payload as labeled text', () => {
    const text = formatGetText(result)
    expect(text).toContain('ref\tctx://01KXHBNECDAH1T4MJ38X88EPFJ/item/one')
    expect(text).toContain('profile\t{"id":"fake.item","version":1}')
    expect(text).toContain('payload\t{"text":"body"}')
    expect(text).toContain('hydratedAt\t789')
  })

  test('pretty output includes the complete payload', () => {
    expect(formatGetPretty(result)).toContain('{"text":"body"}')
  })

  test('returns exit 2 for an invalid Ref before opening dependencies', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})

    expect(await handleGetCommand({ ref: 'not-a-ref', format: 'text' })).toBe(2)
    expect(error).toHaveBeenCalledWith('get: invalid <ref>: not-a-ref')
    error.mockRestore()
  })

  test('selected daemon get preserves output without opening direct dependencies', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let opened = false
    try {
      const exit = await handleGetCommand(
        { ref: result.resource.ref, format: 'json' },
        {
          selectDaemon: () => {
            throw new Error('legacy selection invoked')
          },
          ensureDaemonSelection: async () => ({
            status: 'selected',
            selection: {} as never,
            started: true,
          }),
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

  test('JSON keeps warnings in stdout without duplicating them on stderr', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const warned = {
      ...result,
      warnings: [
        {
          code: 'degraded',
          message: 'partial metadata',
          ref: result.resource.ref,
        },
      ],
    }
    try {
      expect(
        await handleGetCommand(
          { ref: result.resource.ref, format: 'json' },
          {
            selectDaemon: () => ({}) as never,
            get: async () => warned as never,
            open: async () => {
              throw new Error('direct dependencies opened')
            },
          },
        ),
      ).toBe(0)
      expect(log).toHaveBeenCalledWith(formatGetJson(warned))
      expect(error).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
      error.mockRestore()
    }
  })

  test('direct get normalizes SIGINT to cancelled before local retrieval', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const exit = await handleGetCommand(
        { ref: result.resource.ref, format: 'text' },
        {
          selectDaemon: () => {
            throw new Error('legacy selection invoked')
          },
          ensureDaemonSelection: async () => ({ status: 'unsupported' }),
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
