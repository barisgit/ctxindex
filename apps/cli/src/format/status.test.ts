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

test('status output preserves complete diagnostics across shared modes', () => {
  expect(JSON.parse(formatStatus([row], 'json'))).toEqual([row])
  expect(formatStatus([row], 'text')).toContain('extension_unavailable')
  expect(formatStatus([row], 'text')).toContain(
    'provider returned partial data',
  )
  expect(formatStatus([row], 'pretty')).toContain('adapter unavailable')
})

test('text status output escapes whitespace without losing warning refs', () => {
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
      'text',
    ),
  ).toContain('ctx://source-1/records/with whitespace')
})
