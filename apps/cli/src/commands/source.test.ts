import { expect, test } from 'bun:test'
import type { SourceDescription } from '@ctxindex/core/registry'
import { generatedSourceConfigArgs } from '../args/source'
import type { SourceCommandDeps } from '../source/handle-source-command'
import { createSourceCommandRuntime, sourceCommand } from './source'

test('aggregates same-named generated options without losing Adapter ownership', () => {
  const source = (id: string, type: string): SourceDescription => ({
    id,
    profiles: [],
    routing: 'indexed',
    providerApiHosts: [],
    capabilities: [],
    config: {},
    configOptions: [
      { property: 'value', flag: '--config-value', type, required: true },
    ],
  })
  const args = generatedSourceConfigArgs([
    source('z.adapter', 'integer'),
    source('A.adapter', 'string'),
  ])
  expect(args['config-value']?.description).toBe(
    'A.adapter: value (string, required); z.adapter: value (integer, required)',
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

test('marks array-valued generated Adapter options as repeatable', () => {
  const args = generatedSourceConfigArgs([
    {
      id: 'array.adapter',
      configOptions: [
        {
          property: 'labels',
          flag: '--config-labels',
          type: 'string[]',
          required: false,
        },
      ],
    },
  ])
  expect(args['config-labels']).toMatchObject({
    type: 'string',
    multiple: true,
  })
})

test('discovers dynamic config flags without resolving the durable route', async () => {
  let routeResolutions = 0
  const runtime = createSourceCommandRuntime(
    ['add', 'fixture.adapter', '--config-value', 'one'],
    {
      selectDaemon: () => null,
      ensureDaemonSelection: async () => {
        routeResolutions += 1
        throw new Error('durable route resolved during argument discovery')
      },
      loadDefinitions: async () =>
        ({
          description: {
            sources: [
              {
                id: 'fixture.adapter',
                configOptions: [
                  {
                    property: 'value',
                    flag: '--config-value',
                    type: 'string',
                    required: true,
                  },
                ],
              },
            ],
          },
        }) as never,
    } as unknown as SourceCommandDeps,
  )
  try {
    const children =
      typeof runtime.command.subCommands === 'function'
        ? await runtime.command.subCommands()
        : await runtime.command.subCommands
    const addValue = children?.add
    const add =
      typeof addValue === 'function' ? await addValue() : await addValue
    const args =
      typeof add?.args === 'function'
        ? await add.args()
        : ((await add?.args) ?? {})

    expect(args['config-value']).toMatchObject({ type: 'string' })
    expect(routeResolutions).toBe(0)
  } finally {
    await runtime.close()
  }
})
