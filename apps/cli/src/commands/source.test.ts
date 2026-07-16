import { expect, test } from 'bun:test'
import type { SourceDescription } from '@ctxindex/core/registry'
import { generatedSourceConfigArgs } from './source'

test('aggregates same-named generated options without losing Adapter ownership', () => {
  const source = (
    id: string,
    type: string,
    docs: string,
  ): SourceDescription => ({
    id,
    version: 1,
    profiles: [],
    routing: 'indexed',
    auth: { kind: 'none' },
    capabilities: [],
    config: {},
    configOptions: [
      { property: 'value', flag: '--config-value', type, required: true, docs },
    ],
  })
  const args = generatedSourceConfigArgs([
    source('z.adapter', 'integer', 'Count'),
    source('A.adapter', 'string', 'Name'),
  ])
  expect(args['config-value']?.description).toBe(
    'A.adapter: Name (string, required); z.adapter: Count (integer, required)',
  )
})
