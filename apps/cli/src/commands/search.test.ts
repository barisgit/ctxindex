import { describe, expect, test } from 'bun:test'
import { formatSearchJson } from './search'

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
