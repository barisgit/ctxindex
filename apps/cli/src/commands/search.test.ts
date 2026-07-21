import { describe, expect, spyOn, test } from 'bun:test'
import { SearchPlanner } from '@ctxindex/core/search'
import {
  formatSearchJson,
  formatSearchPretty,
  formatSearchText,
  handleSearchCommand,
} from './search'

const longRef = `ctx://source/message/${'immutable-id'.repeat(20)}`

function cardValue(output: string, label: string): string {
  const chunks: string[] = []
  let collecting = false
  for (const line of output.split('\n')) {
    const cells = line.split('│')
    if (cells.length !== 4) continue
    const currentLabel = cells[1]?.trim()
    if (currentLabel === label) collecting = true
    else if (currentLabel) collecting = false
    if (collecting) chunks.push(cells[2]?.trim() ?? '')
  }
  return chunks.join('')
}

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

  test('keeps long Refs complete in text and narrow pretty output', () => {
    const result = {
      results: [
        {
          ref: longRef,
          profile: { id: 'communication.message', version: 1 },
          sourceId: 'source',
          origin: 'provider' as const,
          originRank: 0,
          title: 'FedEx',
          summary: null,
          occurredAt: null,
          chunks: [],
        },
      ],
      warnings: [],
    }
    expect(formatSearchText(result)).toContain(longRef)
    expect(formatSearchText(result)).toContain('\tFedEx\t\\N\t\\N\t[]')
    const pretty = formatSearchPretty(result, { columns: 40 })
    expect(cardValue(pretty, 'Ref')).toBe(longRef)
    expect(pretty).not.toContain('…')
  })

  test('selected daemon search preserves output without opening direct dependencies', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let opened = false
    try {
      const exit = await handleSearchCommand(
        {
          input: { text: 'needle' },
          format: 'json',
          refs: false,
        },
        {
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
        },
      )
      expect(exit).toBe(0)
      expect(opened).toBe(false)
      expect(log).toHaveBeenCalledWith(
        '{"results":[],"warnings":[],"pagination":{"offset":0,"limit":20,"hasMore":false}}',
      )
    } finally {
      log.mockRestore()
    }
  })

  test('JSON search warnings stay only in the stdout envelope', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(
        await handleSearchCommand(
          { input: { text: 'needle' }, format: 'json', refs: false },
          {
            selectDaemon: () => ({}) as never,
            search: async () => ({
              results: [],
              warnings: [
                {
                  sourceId: 'source',
                  code: 'degraded',
                  message: 'provider unavailable',
                },
              ],
            }),
            open: async () => {
              throw new Error('direct dependencies opened')
            },
          },
        ),
      ).toBe(0)
      expect(String(log.mock.calls[0]?.[0])).toContain('"warnings"')
      expect(error).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
      error.mockRestore()
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
      const exit = await handleSearchCommand(
        {
          input: { text: 'needle', remote: true },
          format: 'text',
          refs: false,
        },
        {
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
        },
      )

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

  test('reports opaque continuation deterministically for one remote Source', () => {
    expect(
      formatSearchJson({
        results: [],
        pagination: {
          limit: 50,
          hasMore: true,
          continuation: 'opaque-next-page',
        },
        warnings: [],
      }),
    ).toBe(
      '{"results":[],"pagination":{"limit":50,"hasMore":true,"continuation":"opaque-next-page"},"warnings":[]}',
    )
  })
})
