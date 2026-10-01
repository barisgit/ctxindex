import { expect, test } from 'bun:test'
import {
  rpcExtensionListInputSchema,
  rpcExtensionListResultSchema,
  rpcRegistryDescribeInputSchema,
  rpcRegistryDescribeResultSchema,
} from './schemas'

const description = {
  description: {
    kinds: [{ id: 'fixture.note', version: 1, fields: [], formats: [] }],
    sources: [
      {
        id: 'fixture.adapter',
        profiles: [{ id: 'fixture.note', version: 1 }],
        routing: 'indexed',
        providerApiHosts: [],
        capabilities: ['sync'],
        config: { type: 'object', properties: { path: { type: 'string' } } },
        configOptions: [
          {
            property: 'path',
            flag: '--config-path',
            type: 'string',
            required: true,
          },
        ],
      },
    ],
    actions: [
      {
        id: 'fixture.action',
        profile: { id: 'fixture.note', version: 1 },
        effect: 'reversible',
        input: { type: 'object' },
        output: { id: 'fixture.note', version: 1 },
        adapters: [{ id: 'fixture.adapter' }],
      },
    ],
  },
  diagnostics: [
    { path: '/extension/package', message: 'Failed to load extension' },
  ],
} as const
const installed = {
  id: 'fixture.extension',
  sourceKind: 'local',
  requestedTarget: '/extension/package',
  resolvedIdentity: '/extension/package',
  materializationDigest: 'a'.repeat(64),
  installedAt: 1,
  updatedAt: 2,
} as const
const curation = {
  extension_id: 'fixture.extension',
  catalog_name: 'fixture',
  catalog_id: 'fixture.catalog',
  repository: 'file:///catalog/repository',
  commit: 'b'.repeat(40),
  snapshot_acquired_at: 1,
  source_locator: {
    kind: 'literal',
    module: '/extension/entry.ts',
    catalogId: 'fixture.catalog',
    entryIndex: 0,
    extensionId: 'fixture.extension',
  },
  execution_materialization_digest: 'a'.repeat(64),
} as const
const inventory = {
  rows: [
    {
      id: 'fixture.extension',
      profiles: [{ id: 'fixture.note', version: 1 }],
      adapters: [{ id: 'fixture.adapter' }],
    },
  ],
  provenance: [
    { id: 'fixture.extension', kind: 'path', path: '/extension/package' },
  ],
  installed: [{ ...installed, curation }],
  diagnostics: description.diagnostics,
} as const

test('registry DTOs preserve only bounded declarative values and explicit business locations', () => {
  expect(rpcRegistryDescribeResultSchema.parse(description)).toEqual(
    description,
  )
  expect(rpcExtensionListResultSchema.parse(inventory)).toEqual(inventory)
  expect(rpcRegistryDescribeInputSchema.parse({})).toEqual({})
  expect(rpcExtensionListInputSchema.parse({})).toEqual({})
  for (const schema of [
    rpcRegistryDescribeInputSchema,
    rpcExtensionListInputSchema,
  ]) {
    expect(schema.safeParse({ command: 'anything', argv: [] }).success).toBe(
      false,
    )
  }
})

test('registry description rejects executable definitions, unsafe schemas, and extra runtime data', () => {
  for (const extra of [
    { registry: {} },
    { databasePath: '/private/database' },
    { credentials: 'secret-canary' },
  ]) {
    expect(
      rpcRegistryDescribeResultSchema.safeParse({ ...description, ...extra })
        .success,
    ).toBe(false)
  }
  const source = description.description.sources[0]
  for (const extra of [
    { sync: () => {} },
    { config: { callback: () => {} } },
    { accessToken: 'secret-canary' },
  ]) {
    expect(
      rpcRegistryDescribeResultSchema.safeParse({
        ...description,
        description: {
          ...description.description,
          sources: [{ ...source, ...extra }],
        },
      }).success,
    ).toBe(false)
  }
  expect(
    rpcRegistryDescribeResultSchema.safeParse({
      ...description,
      description: {
        ...description.description,
        kinds: Array(1_025).fill(description.description.kinds[0]),
      },
    }).success,
  ).toBe(false)
})

test('Extension projection rejects credentials and undeclared paths, errors, definitions, and unbounded fields', () => {
  for (const requestedTarget of [
    'https://user:secret-canary@example.test/repo',
    'secret-canary@example.test:repo',
    'x'.repeat(16_385),
  ]) {
    expect(
      rpcExtensionListResultSchema.safeParse({
        ...inventory,
        installed: [{ ...installed, requestedTarget }],
      }).success,
    ).toBe(false)
  }
  for (const extra of [
    { socketPath: '/private/socket' },
    { databasePath: '/private/database' },
    { stack: 'secret-canary' },
    { cause: 'secret-canary' },
  ]) {
    expect(
      rpcExtensionListResultSchema.safeParse({
        ...inventory,
        diagnostics: [{ ...description.diagnostics[0], ...extra }],
      }).success,
    ).toBe(false)
  }
  expect(
    rpcExtensionListResultSchema.safeParse({
      ...inventory,
      rows: [{ ...inventory.rows[0], actions: { run: () => {} } }],
    }).success,
  ).toBe(false)
  expect(
    rpcExtensionListResultSchema.safeParse({
      ...inventory,
      provenance: [
        { ...inventory.provenance[0], runtimeRoot: '/private/runtime' },
      ],
    }).success,
  ).toBe(false)
  expect(
    rpcExtensionListResultSchema.safeParse({
      ...inventory,
      rows: Array(1_025).fill(inventory.rows[0]),
    }).success,
  ).toBe(false)
})
