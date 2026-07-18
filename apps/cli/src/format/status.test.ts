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
  warningsCount: 2,
  lastWarning: {
    code: 'degraded',
    message: 'provider returned partial data',
  },
  errorsCount: 1,
  lastError: 'adapter unavailable',
  cursor: { page: 3 },
}

test('status output projects availability only for text display', () => {
  expect(JSON.parse(formatStatus([row], { json: true }))).toEqual([row])
  expect(formatStatus([row], { json: false, format: 'compact' })).toContain(
    'status=extension_unavailable',
  )
  expect(formatStatus([row], { json: false, format: 'compact' })).toContain(
    'warnings=2 warning=degraded:provider_returned_partial_data errors=1',
  )
  expect(formatStatus([row], { json: false })).toContain(
    'extension_unavailable',
  )
  expect(formatStatus([row], { json: false })).toContain(
    'warnings=2\tdegraded: provider returned partial data\terrors=1',
  )
})

test('compact status output normalizes whitespace in warning refs', () => {
  expect(
    formatStatus(
      [
        {
          ...row,
          lastWarning: {
            code: 'degraded',
            message: 'partial response',
            ref: 'ctx://source-1/records/with whitespace',
          },
        },
      ],
      { json: false, format: 'compact' },
    ),
  ).toContain(
    'warning=degraded:partial_response:ref=ctx://source-1/records/with_whitespace',
  )
})
