import { expect, test } from 'bun:test'
import type { StatusRow } from '@ctxindex/core/source'
import { formatStatus } from './status'

const row: StatusRow = {
  sourceId: 'source-1',
  adapterId: 'fixture.adapter',
  realmSlug: 'work',
  availability: 'extension_unavailable',
  lastStatus: 'failed',
  lastRunAt: 1,
  errorsCount: 1,
  lastError: 'adapter unavailable',
  cursor: { page: 3 },
}

test('status output projects availability only for text display', () => {
  expect(JSON.parse(formatStatus([row], { json: true }))).toEqual([row])
  expect(formatStatus([row], { json: false, format: 'compact' })).toContain(
    'status=extension_unavailable',
  )
  expect(formatStatus([row], { json: false })).toContain(
    'extension_unavailable',
  )
})
