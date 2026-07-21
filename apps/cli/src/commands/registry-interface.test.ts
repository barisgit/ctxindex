import { describe, expect, test } from 'bun:test'
import type { RegistryDescription } from '@ctxindex/core/registry'
import {
  filterRegistryDescription,
  formatExtensions,
  formatRegistryMarkdown,
  formatRegistryText,
  registryJsonValue,
} from '../format/registry'

const description: RegistryDescription = {
  kinds: [
    {
      id: 'fake.kind',
      version: 1,
      fields: [{ name: 'title', type: 'string' }],
      formats: [{ name: 'markdown', mediaType: 'text/markdown' }],
    },
  ],
  sources: [
    {
      id: 'fake.adapter',
      profiles: [{ id: 'fake.kind', version: 1 }],
      routing: 'indexed',
      providerApiHosts: [],
      capabilities: ['retrieve'],
      config: { type: 'object' },
      configOptions: [
        {
          property: 'root_path',
          flag: '--config-root-path',
          type: 'string',
          required: true,
          default: '/notes',
        },
      ],
    },
  ],
  actions: [
    {
      id: 'fake.run',
      profile: { id: 'fake.kind', version: 1 },
      effect: 'reversible',
      input: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          to: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string',
              minLength: 1,
              pattern: '^[^\\r\\n]*$',
            },
          },
          subject: { type: 'string', pattern: '^[^\\r\\n]*$' },
          priority: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            default: 3,
          },
          advanced: {
            allOf: [{ type: 'string', minLength: 2 }],
          },
        },
        required: ['to', 'subject'],
        additionalProperties: false,
      },
      output: { id: 'fake.kind', version: 1 },
      adapters: [{ id: 'fake.adapter' }],
    },
  ],
}

describe('describe interface', () => {
  test('formats the provider id and renamed authorization URL', () => {
    const [source] = description.sources
    if (!source) throw new Error('expected source fixture')
    const oauthDescription = {
      ...description,
      sources: [
        {
          ...source,
          provider: {
            id: 'fake',
            auth: {
              kind: 'oauth2',
              authorizationUrl: 'https://auth.example.com/authorize',
              tokenUrl: 'https://auth.example.com/token',
              baseScopes: ['openid'],
              registration: {
                environment: {
                  clientId: 'FAKE_CLIENT_ID',
                  clientSecret: 'FAKE_CLIENT_SECRET',
                },
              },
              allowedHosts: ['auth.example.com'],
            },
          },
          access: { scopes: ['fake.read'] },
          providerApiHosts: ['api.example.com'],
        },
      ],
    }

    expect(formatRegistryText(oauthDescription, 'full')).toContain(
      [
        'provider: fake',
        '  auth: oauth2',
        '    authorization URL: https://auth.example.com/authorize',
        '    token URL: https://auth.example.com/token',
        '    auth hosts: auth.example.com',
        '    provider base scopes: openid',
        '    environment: clientId=FAKE_CLIENT_ID, clientSecret=FAKE_CLIENT_SECRET',
        '    Adapter scopes: fake.read',
        '  provider API hosts: api.example.com',
      ].join('\n'),
    )
    expect(formatRegistryMarkdown(oauthDescription)).toContain(
      '- Environment: clientId=`FAKE_CLIENT_ID`, clientSecret=`FAKE_CLIENT_SECRET`',
    )
  })

  test('filters exact ids and renders full text, Markdown, and JSON data', () => {
    const selected = filterRegistryDescription(
      description,
      'adapter',
      'fake.adapter',
    )
    expect(selected).toBeDefined()
    if (!selected) throw new Error('expected selected Adapter')
    expect(registryJsonValue(selected, 'adapter', 'full')).toEqual(
      description.sources,
    )
    expect(
      filterRegistryDescription(description, 'profile', 'missing'),
    ).toBeUndefined()
    expect(formatRegistryText(description, 'full')).toContain(
      '--config-root-path <string> required',
    )
    const text = formatRegistryText(description, 'full')
    expect(text).toContain('title <string>')
    expect(text).toContain('markdown (text/markdown)')
    expect(text).toContain('default: "/notes"')
    expect(text).toContain('  input:')
    expect(text).toContain('    to <string[]> required')
    expect(text).toContain('      min items: 1')
    expect(text).toContain(
      '      items: <string>; min length: 1; pattern: "^[^\\\\r\\\\n]*$"',
    )
    expect(text).toContain('    subject <string> required')
    expect(text).toContain('    priority <integer>')
    expect(text).toContain('      minimum: 1')
    expect(text).toContain('      maximum: 5')
    expect(text).toContain('      default: 3')
    expect(text).toContain(
      '      schema fragment: {"allOf":[{"type":"string","minLength":2}]}',
    )
    expect(text).toContain('    additional properties: not allowed')
    expect(text).not.toContain('input: {"$schema"')
    expect(text).toContain('provider: none')
    const markdown = formatRegistryMarkdown(description, 'full')
    expect(markdown).toContain('# ctxindex Registry')
    expect(markdown).toContain('`title` (string)')
    expect(markdown).toContain('--config-root-path')
    expect(markdown).toContain('Adapter bindings: fake.adapter')
    expect(markdown).toContain('| `to` | `string[]` | yes |')
    expect(markdown).toContain('| `priority` | `integer` | no |')
    expect(markdown).toContain(
      'schema fragment: {"allOf":[{"type":"string","minLength":2}]}',
    )
    expect(markdown).toContain('Additional properties are not allowed.')
    expect(markdown).not.toContain('Input: `{"$schema"')
    expect(markdown).toContain('- Provider: none')
  })

  test('projects compact lists, exact detail, and explicit full snapshots', () => {
    expect(registryJsonValue(description, undefined, 'compact')).toEqual({
      kinds: [
        {
          id: 'fake.kind',
          version: 1,
        },
      ],
      sources: [
        {
          id: 'fake.adapter',
          routing: 'indexed',
          capabilities: ['retrieve'],
        },
      ],
      actions: [
        {
          id: 'fake.run',
          profile: { id: 'fake.kind', version: 1 },
          effect: 'reversible',
          output: { id: 'fake.kind', version: 1 },
          adapters: [{ id: 'fake.adapter' }],
        },
      ],
    })
    const selectedAction = filterRegistryDescription(
      description,
      'action',
      'fake.run',
    )
    expect(selectedAction).toBeDefined()
    if (!selectedAction) throw new Error('expected selected Action')
    expect(registryJsonValue(selectedAction, 'action', 'detail')).toEqual(
      description.actions[0],
    )
    const selectedMarkdown = formatRegistryMarkdown(selectedAction, 'detail')
    expect(selectedMarkdown).toContain('## Actions')
    expect(selectedMarkdown).not.toContain('## Profiles')
    expect(selectedMarkdown).not.toContain('## Adapters')
    expect(registryJsonValue(description, undefined, 'full')).toEqual(
      description,
    )

    const compactText = formatRegistryText(description, 'compact')
    expect(compactText).toContain('PROFILES (1)')
    expect(compactText).toContain('fake.kind@1')
    expect(compactText).not.toContain('field title')
    expect(compactText).toContain(
      'Use `ctxindex describe <profile|adapter|action> <id>` for full details.',
    )
    const compactMarkdown = formatRegistryMarkdown(description, 'compact')
    expect(compactMarkdown).toContain('## Profiles (1)')
    expect(compactMarkdown).toContain('- `fake.kind@1`')
    expect(compactMarkdown).not.toContain('Fields:')
  })
})

describe('extensions list interface', () => {
  test('formats deterministic exact references', () => {
    const registry = {
      list: () => [
        {
          id: 'external',
          profiles: [
            { id: 'z', version: 1 },
            { id: 'a', version: 1 },
          ],
          adapters: [{ id: 'b' }],
        },
      ],
    }
    expect(formatExtensions(registry, false)).toBe(
      'external\tProfiles: a@1, z@1\tAdapters: b',
    )
    expect(JSON.parse(formatExtensions(registry, true))).toEqual([
      {
        id: 'external',
        profiles: [
          { id: 'a', version: 1 },
          { id: 'z', version: 1 },
        ],
        adapters: [{ id: 'b' }],
      },
    ])
    expect(
      JSON.parse(
        formatExtensions(
          registry,
          true,
          [
            {
              id: 'external',
              kind: 'catalog',
              catalog: 'fixture',
              catalogId: 'fixture.catalog',
              repository: '/tmp/fixture.git',
              commit: 'a'.repeat(40),
              snapshotAcquiredAt: 1_000,
              sourceLocator: { kind: 'package', entryIndex: 0 },
              sourceKind: 'npm',
              requestedTarget: '@example/external@1.2.3',
              resolvedIdentity: '1.2.3 (sha512-exact)',
              materializationDigest: 'b'.repeat(64),
              installedAt: 500,
              updatedAt: 750,
            },
          ],
          [
            {
              id: 'external',
              sourceKind: 'npm',
              requestedTarget: '@example/external@1.2.3',
              resolvedIdentity: '1.2.3 (sha512-exact)',
              materializationDigest: 'b'.repeat(64),
              installedAt: 500,
              updatedAt: 750,
              curation: {
                extension_id: 'external',
                catalog_name: 'fixture',
                catalog_id: 'fixture.catalog',
                repository: '/tmp/fixture.git',
                commit: 'a'.repeat(40),
                snapshot_acquired_at: 1_000,
                source_locator: { kind: 'package', entryIndex: 0 },
                execution_materialization_digest: 'b'.repeat(64),
              },
            },
          ],
          4_000,
        ),
      )[0].provenance,
    ).toMatchObject({ snapshotAcquiredAt: 1_000, snapshotAgeMs: 3_000 })

    const unavailable = JSON.parse(
      formatExtensions(
        { list: () => [] },
        true,
        [],
        [
          {
            id: 'example.direct',
            sourceKind: 'git',
            requestedTarget: 'github:example/direct#main',
            resolvedIdentity: 'a'.repeat(40),
            materializationDigest: 'b'.repeat(64),
            installedAt: 100,
            updatedAt: 200,
          },
        ],
        4_000,
      ),
    )
    expect(unavailable).toEqual([
      expect.objectContaining({
        id: 'example.direct',
        available: false,
        provenance: expect.objectContaining({
          installedAt: 100,
          updatedAt: 200,
        }),
      }),
    ])
  })

  test('keeps a failed direct pin unavailable when another origin shares its id', () => {
    const result = JSON.parse(
      formatExtensions(
        {
          list: () => [{ id: 'example.direct', profiles: [], adapters: [] }],
        },
        true,
        [{ id: 'example.direct', kind: 'builtin' }],
        [
          {
            id: 'example.direct',
            sourceKind: 'npm',
            requestedTarget: '@example/direct@^1',
            resolvedIdentity: '1.2.3',
            materializationDigest: 'b'.repeat(64),
            installedAt: 100,
            updatedAt: 200,
          },
        ],
      ),
    )

    expect(result).toEqual([
      expect.objectContaining({
        id: 'example.direct',
        available: false,
        provenance: expect.objectContaining({ kind: 'direct' }),
      }),
    ])
  })

  test('retains exact Catalog curation for an unavailable generic record', () => {
    const result = JSON.parse(
      formatExtensions(
        { list: () => [] },
        true,
        [],
        [
          {
            id: 'example.curated',
            sourceKind: 'git',
            requestedTarget: 'git+https://example.test/curated.git',
            resolvedIdentity: 'a'.repeat(40),
            materializationDigest: 'b'.repeat(64),
            installedAt: 100,
            updatedAt: 200,
            curation: {
              extension_id: 'example.curated',
              catalog_name: 'team',
              catalog_id: 'team.catalog',
              repository: 'https://example.test/catalog.git',
              commit: 'c'.repeat(40),
              snapshot_acquired_at: 1_000,
              source_locator: {
                kind: 'literal',
                module: './catalog.ts',
                catalogId: 'team.catalog',
                entryIndex: 3,
                extensionId: 'example.curated',
              },
              execution_materialization_digest: 'b'.repeat(64),
            },
          },
        ],
        4_000,
      ),
    )

    expect(result).toEqual([
      expect.objectContaining({
        id: 'example.curated',
        available: false,
        provenance: expect.objectContaining({
          kind: 'catalog',
          catalog: 'team',
          catalogId: 'team.catalog',
          snapshotAgeMs: 3_000,
          sourceLocator: {
            kind: 'literal',
            module: './catalog.ts',
            catalogId: 'team.catalog',
            entryIndex: 3,
            extensionId: 'example.curated',
          },
          sourceKind: 'git',
          resolvedIdentity: 'a'.repeat(40),
        }),
      }),
    ])
  })
})
