import { describe, expect, spyOn, test } from 'bun:test'
import { SearchPlanner } from '@ctxindex/core/search'
import { formatSearchJson, handleSearchCommand } from './search'

describe('search JSON output', () => {
  test('uses the unified deterministic result envelope', () => {
    expect(
      formatSearchJson({
        results: [
          {
            ref: 'ctx://source/item/1',
            profile: { id: 'fake.item', version: 1 },
            sourceId: 'source',
            origin: 'local',
            originRank: 0,
            title: 'Title',
            summary: null,
            occurredAt: null,
            chunks: [],
          },
        ],
        warnings: [],
      }),
    ).toBe(
      '{"results":[{"ref":"ctx://source/item/1","profile":{"id":"fake.item","version":1},"sourceId":"source","origin":"local","originRank":0,"title":"Title","summary":null,"occurredAt":null,"chunks":[]}],"warnings":[]}',
    )
  })

  test('reports pagination deterministically for local executions', () => {
    expect(
      formatSearchJson({
        results: [],
        pagination: { offset: 20, limit: 20, hasMore: true },
        warnings: [],
      }),
    ).toBe(
      '{"results":[],"pagination":{"offset":20,"limit":20,"hasMore":true},"warnings":[]}',
    )
  })

  test('selected daemon search preserves output without opening direct dependencies', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let opened = false
    try {
      const exit = await handleSearchCommand(['needle', '--json'], {
        selectDaemon: () => ({}) as never,
        search: async (_selection, input) => {
          expect(input.text).toBe('needle')
          return {
            results: [],
            warnings: [],
            pagination: { offset: 0, limit: 20, hasMore: false },
          }
        },
        open: async () => {
          opened = true
          throw new Error('direct dependencies opened')
        },
      })
      expect(exit).toBe(0)
      expect(opened).toBe(false)
      expect(log).toHaveBeenCalledWith(
        '{"results":[],"warnings":[],"pagination":{"offset":0,"limit":20,"hasMore":false}}',
      )
    } finally {
      log.mockRestore()
    }
  })

  test('direct remote search without Source selectors forwards SIGINT and exits cancelled', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const search = spyOn(SearchPlanner.prototype, 'search').mockImplementation(
      async (input) => {
        process.emit('SIGINT')
        input.signal?.throwIfAborted()
        return { results: [], warnings: [] }
      },
    )
    try {
      const exit = await handleSearchCommand(['needle', '--remote'], {
        selectDaemon: () => null,
        search: async () => {
          throw new Error('daemon transport invoked')
        },
        open: async () =>
          ({
            db: {},
            registry: { profiles: {} },
            authService: {},
            logger: {},
            sourceService: {
              resolveSourceId: () => {
                throw new Error('source selector resolved')
              },
            },
            close: async () => {},
          }) as never,
      })

      expect(exit).toBe(130)
      expect(search).toHaveBeenCalledTimes(1)
      expect(search.mock.calls[0]?.[0].remote).toBe(true)
      expect(search.mock.calls[0]?.[0].sourceIds).toBeUndefined()
      expect(search.mock.calls[0]?.[0].signal?.aborted).toBe(true)
    } finally {
      process.removeAllListeners('SIGINT')
      search.mockRestore()
      error.mockRestore()
    }
  })
})
