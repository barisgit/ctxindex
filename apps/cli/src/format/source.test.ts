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
}

test('source output exposes availability without replacing lastStatus', () => {
  expect(JSON.parse(formatSources([source], { json: true }))).toMatchObject([
    {
      availability: 'extension_unavailable',
      lastStatus: 'failed',
      syncEnabled: true,
    },
  ])
  expect(formatSources([source], { json: false, format: 'compact' })).toContain(
    'status=extension_unavailable',
  )
  expect(formatSources([source], { json: false })).toContain(
    'extension_unavailable',
  )
})
