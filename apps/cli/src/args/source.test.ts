import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import type { SourceDescription } from '@ctxindex/core/registry'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { defineAdapter, defineExtension } from '@ctxindex/extension-sdk'
import { runCommand } from 'citty'
import { z } from 'zod'
import { defineCtxCommand } from '../command-model'
import {
  resolveSourceAddArgs,
  type SourceArgumentDescription,
  sourceAddArgs,
  sourceAddBaseArgs,
} from './source'

afterEach(() => {
  process.exitCode = 0
})

const externalSource: SourceDescription = {
  id: 'external.adapter',
  profiles: [],
  routing: 'indexed',
  providerApiHosts: [],
  capabilities: [],
  config: {},
  configOptions: [
    {
      property: 'root_path',
      flag: '--config-root-path',
      type: 'string',
      required: true,
    },
    {
      property: 'ratio',
      flag: '--config-ratio',
      type: 'number',
      required: false,
    },
    {
      property: 'count',
      flag: '--config-count',
      type: 'integer',
      required: false,
    },
    {
      property: 'enabled',
      flag: '--config-enabled',
      type: 'boolean',
      required: false,
    },
    {
      property: 'labels',
      flag: '--config-labels',
      type: 'string[]',
      required: false,
    },
    {
      property: 'scores',
      flag: '--config-scores',
      type: 'number[]',
      required: false,
    },
  ],
}

async function resolve(
  rawArgs: string[],
  sources: readonly SourceArgumentDescription[] = [externalSource],
) {
  let resolved: ReturnType<typeof resolveSourceAddArgs> | undefined
  const command = defineCtxCommand({
    meta: { name: 'add' },
    args: sourceAddArgs(sources),
    run: ({ args }) => {
      resolved = resolveSourceAddArgs(args, sources)
    },
  })
  await runCommand(command, { rawArgs })
  return resolved
}

test('Account selector is public while Grant selection remains absent', () => {
  expect(sourceAddBaseArgs.account.description).toContain('Account')
  expect(Object.keys(sourceAddBaseArgs)).not.toContain('grant')
})

test('source add documents its required alternative Adapter selectors', () => {
  expect(sourceAddBaseArgs.adapter.description).toBe(
    'Adapter ID (provide the positional ID or --adapter)',
  )
  expect(sourceAddBaseArgs['adapter-id'].description).toBe(
    'Adapter ID (provide the positional ID or --adapter)',
  )
})

describe('source add generated Adapter config options', () => {
  test('resolves external primitive and repeatable array values from Citty args', async () => {
    expect(
      await resolve([
        'external.adapter',
        '--realm',
        'work',
        '--config-root-path',
        '/tmp/files',
        '--config-ratio',
        '1.25',
        '--config-count',
        '-2',
        '--config-enabled',
        'false',
        '--config-labels',
        'first',
        '--config-labels',
        'second',
        '--config-scores',
        '1',
        '--config-scores',
        '2.5',
      ]),
    ).toMatchObject({
      adapterId: 'external.adapter',
      realmSlug: 'work',
      configJson: JSON.stringify({
        root_path: '/tmp/files',
        ratio: 1.25,
        count: -2,
        enabled: false,
        labels: ['first', 'second'],
        scores: [1, 2.5],
      }),
    })
  })

  test('addresses colliding and nested config properties from a real registry', async () => {
    const adapter = defineAdapter({
      id: 'collision.adapter',
      configSchema: z.object({
        foo_bar: z.string(),
        'foo-bar': z.string(),
        nested: z.object({ enabled: z.boolean() }),
      }),
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })
    const registry = createExtensionRegistry([
      defineExtension({ id: 'collision', profiles: [], adapters: [adapter] }),
    ])
    const sources = describeRegistry(registry).sources
    expect(
      await resolve(
        [
          'collision.adapter',
          '--config--666f6f2d626172',
          'hyphen',
          '--config--666f6f5f626172',
          'underscore',
          '--config-nested',
          '{"enabled":true}',
        ],
        sources,
      ),
    ).toMatchObject({
      configJson: JSON.stringify({
        'foo-bar': 'hyphen',
        foo_bar: 'underscore',
        nested: { enabled: true },
      }),
    })
  })

  test('Citty rejects repeated scalar generated options before resolving', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(
        await resolve([
          'external.adapter',
          '--config-count',
          '1',
          '--config-count',
          '2',
        ]),
      ).toBeUndefined()
      expect(process.exitCode).toBe(2)
    } finally {
      error.mockRestore()
    }
  })

  test('rejects generated options owned by another Adapter and config-json conflicts', async () => {
    const other = {
      id: 'other.adapter',
      configOptions: [
        {
          property: 'only',
          flag: '--config-only',
          type: 'string',
          required: false,
        },
      ],
    }
    await expect(
      resolve(
        ['external.adapter', '--config-only', 'value'],
        [externalSource, other],
      ),
    ).rejects.toMatchObject({ code: 'invalid_args' })
    await expect(
      resolve(
        [
          'external.adapter',
          '--config-json',
          '{}',
          '--config-root-path',
          '/tmp/files',
        ],
        [externalSource],
      ),
    ).rejects.toMatchObject({ code: 'invalid_args' })
  })
})
