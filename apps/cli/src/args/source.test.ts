import { describe, expect, test } from 'bun:test'
import type { SourceDescription } from '@ctxindex/core/registry'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { defineAdapter, defineExtension } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { parseSourceArgs } from './source'

const externalSource: SourceDescription = {
  id: 'external.adapter',
  version: 1,
  profiles: [],
  routing: 'indexed',
  auth: { kind: 'none' },
  providerApiHosts: [],
  capabilities: [],
  config: {},
  configOptions: [
    {
      property: 'root_path',
      flag: '--config-root-path',
      type: 'string',
      required: true,
      docs: 'Root path',
    },
    {
      property: 'ratio',
      flag: '--config-ratio',
      type: 'number',
      required: false,
    },
    {
      property: 'json',
      flag: '--config--6a736f6e',
      type: 'string',
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

function add(...args: string[]) {
  return parseSourceArgs(
    ['add', 'external.adapter', '--realm', 'work', ...args],
    [externalSource],
  )
}

describe('source add generated Adapter config options', () => {
  test('parses external primitive and repeated array options without Adapter literals', () => {
    expect(
      add(
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
        '--config--6a736f6e',
        'property-value',
      ),
    ).toMatchObject({
      kind: 'add',
      adapterId: 'external.adapter',
      configJson: JSON.stringify({
        root_path: '/tmp/files',
        ratio: 1.25,
        count: -2,
        enabled: false,
        labels: ['first', 'second'],
        scores: [1, 2.5],
        json: 'property-value',
      }),
    })
  })

  test('addresses colliding and nested config properties from a real registry', () => {
    const adapter = defineAdapter({
      id: 'collision.adapter',
      version: 1,
      configSchema: z.object({
        foo_bar: z.string(),
        'foo-bar': z.string(),
        nested: z.object({ enabled: z.boolean() }),
      }),
      auth: { kind: 'none' },
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })
    const registry = createExtensionRegistry([
      defineExtension({
        id: 'collision',
        version: 1,
        profiles: [],
        adapters: [adapter],
      }),
    ])
    const sources = describeRegistry(registry).sources
    const parsed = parseSourceArgs(
      [
        'add',
        'collision.adapter',
        '--config--666f6f2d626172',
        'hyphen',
        '--config--666f6f5f626172',
        'underscore',
        '--config-nested',
        '{"enabled":true}',
      ],
      sources,
    )
    expect(parsed).toMatchObject({
      kind: 'add',
      configJson: JSON.stringify({
        'foo-bar': 'hyphen',
        foo_bar: 'underscore',
        nested: { enabled: true },
      }),
    })
  })

  test('rejects repeated scalar generated options while preserving array order', () => {
    expect(add('--config-count', '1', '--config-count', '2')).toMatchObject({
      kind: 'unknown',
      message: expect.stringContaining('cannot be repeated'),
    })
    expect(
      add(
        '--config-labels',
        'z',
        '--config-labels',
        'A',
        '--config-labels',
        '!',
      ),
    ).toMatchObject({
      kind: 'add',
      configJson: JSON.stringify({ labels: ['z', 'A', '!'] }),
    })
  })

  test.each([
    [['--config-count', '1.2'], 'invalid integer'],
    [['--config-ratio', 'one'], 'invalid number'],
    [['--config-enabled', 'yes'], 'invalid boolean'],
    [['--config-unknown', 'x'], 'unknown option'],
    [['--config-json', '{}', '--config-root-path', '/tmp'], 'cannot combine'],
  ] as const)('rejects %j', (args, message) => {
    expect(add(...args)).toMatchObject({
      kind: 'unknown',
      message: expect.stringContaining(message),
    })
  })

  test('leaves missing required options to the Adapter schema', () => {
    expect(add()).toEqual({
      kind: 'add',
      adapterId: 'external.adapter',
      realmSlug: 'work',
    })
  })
})

describe('source option validation', () => {
  test.each([
    [['add', 'external.adapter', '--root', '/tmp'], '--root'],
    [['add', 'external.adapter', '--path', '/tmp'], '--path'],
    [['add', 'external.adapter', '--wat'], '--wat'],
    [['list', '--account', 'a@example.com'], '--account'],
    [['remove', 'source-id', '--realm', 'work'], '--realm'],
    [['add', 'external.adapter', 'extra'], 'unexpected positional'],
    [['list', 'extra'], 'unexpected positional'],
    [['remove', 'source-id', 'extra'], 'unexpected positional'],
    [
      ['add', 'external.adapter', '--adapter', 'other.adapter'],
      'both positional <adapter-id> and --adapter',
    ],
    [
      ['add', 'missing.adapter', '--realm', 'work'],
      'unknown adapter id "missing.adapter"',
    ],
    [
      ['add', 'external.adapter', '--realm', 'one', '--realm', 'two'],
      '--realm cannot be repeated',
    ],
    [
      ['add', 'external.adapter', '--config-json', '{}', '--config-json', '{}'],
      '--config-json cannot be repeated',
    ],
  ] as const)('rejects invalid argv %j', (args, message) => {
    expect(parseSourceArgs([...args], [externalSource])).toMatchObject({
      kind: 'unknown',
      message: expect.stringContaining(message),
    })
  })

  test.each([
    [['add', 'external.adapter', '--realm']],
    [['add', 'external.adapter', '--label']],
    [['add', 'external.adapter', '--account']],
    [['add', 'external.adapter', '--config-json']],
    [['add', 'external.adapter', '--search-routing']],
    [['list', '--realm']],
    [['list', '--format']],
  ] as const)('rejects a missing common flag value for %j', (args) => {
    expect(parseSourceArgs([...args], [externalSource])).toMatchObject({
      kind: 'unknown',
      message: expect.stringContaining('requires a value'),
    })
  })
})
