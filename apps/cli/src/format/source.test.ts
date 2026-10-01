import { expect, test } from 'bun:test'
import type { SourceRow } from '@ctxindex/core/source'
import { formatSources } from './source'

const source: SourceRow = {
  id: 'source-1',
  realm_id: 'realm-1',
  realm_slug: 'work',
  adapter_id: 'fixture.adapter',
  label: 'fixture',
  config_json: '{}',
  sync_enabled: true,
  grant_id: 'private-grant-1',
  created_at: 1,
  availability: 'extension_unavailable',
  last_status: 'failed',
  warnings_count: 2,
  last_warning: {
    code: 'degraded',
    message: 'provider returned partial data',
  },
  errors_count: 1,
  last_error: 'provider request failed',
}

test('source output exposes availability without replacing lastStatus', () => {
  const json = formatSources([source], 'json')
  expect(JSON.parse(json)).toMatchObject([
    {
      availability: 'extension_unavailable',
      lastStatus: 'failed',
      syncEnabled: true,
      warningsCount: 2,
      lastWarning: {
        code: 'degraded',
        message: 'provider returned partial data',
      },
      errorsCount: 1,
      lastError: 'provider request failed',
    },
  ])
  expect(json).not.toMatch(/grant/i)
  expect(formatSources([source], 'text')).toContain('extension_unavailable')
  expect(formatSources([source], 'text')).toContain(
    'provider returned partial data',
  )
  expect(formatSources([source], 'pretty')).toContain('provider request failed')
})

test('source JSON represents absent warning and error diagnostics explicitly', () => {
  expect(
    JSON.parse(
      formatSources(
        [
          {
            ...source,
            warnings_count: 0,
            last_warning: null,
            errors_count: 0,
            last_error: null,
          },
        ],
        'json',
      ),
    ),
  ).toMatchObject([
    {
      warningsCount: 0,
      lastWarning: null,
      errorsCount: 0,
      lastError: null,
    },
  ])
})

test('text source output retains warning refs with whitespace escaped', () => {
  expect(
    formatSources(
      [
        {
          ...source,
          last_warning: {
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
