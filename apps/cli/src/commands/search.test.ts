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
})
