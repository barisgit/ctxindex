import { expect, test } from 'bun:test'
import type { SourceRow } from '@ctxindex/core/source'
import { formatSources } from './source'

const source: SourceRow = {
  id: 'source-1',
  realm_id: 'realm-1',
  realm_slug: 'work',
  adapter_id: 'fixture.adapter',
  adapter_version: 1,
  label: 'fixture',
  config_json: '{}',
  sync_enabled: true,
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
  expect(JSON.parse(formatSources([source], { json: true }))).toMatchObject([
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
  expect(formatSources([source], { json: false, format: 'compact' })).toContain(
    'status=extension_unavailable',
  )
  expect(formatSources([source], { json: false, format: 'compact' })).toContain(
    'warnings=2 warning=degraded:provider_returned_partial_data errors=1',
  )
  expect(formatSources([source], { json: false, format: 'compact' })).toContain(
    'error=provider_request_failed',
  )
  expect(formatSources([source], { json: false })).toContain(
    'extension_unavailable',
  )
  expect(
    formatSources([source], { json: false }).replace(/\s+/g, ' '),
  ).toContain('degraded: provider returned partial data')
  expect(formatSources([source], { json: false })).toContain(
    'provider request failed',
  )
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
        { json: true },
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
