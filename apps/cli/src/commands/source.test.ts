import { expect, test } from 'bun:test'
import type { SourceDescription } from '@ctxindex/core/registry'
import { generatedSourceConfigArgs, sourceCommand } from './source'

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
    providerApiHosts: [],
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

test('declares --no-sync as a generated Source add boolean argument', async () => {
  const subCommands =
    typeof sourceCommand.subCommands === 'function'
      ? await sourceCommand.subCommands()
      : await sourceCommand.subCommands
  const add = subCommands?.add
  expect(add).toBeDefined()
  const resolvedAdd = typeof add === 'function' ? await add() : await add
  const args =
    typeof resolvedAdd?.args === 'function'
      ? await resolvedAdd.args()
      : ((await resolvedAdd?.args) ?? {})
  expect(args['no-sync']).toEqual({
    type: 'boolean',
    description: 'Disable synchronization for this Source',
  })
})
