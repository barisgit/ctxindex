import { describe, expect, test } from 'bun:test'
import type { RegistryDescription } from '@ctxindex/core/registry'
import { parseDescribeArgs } from '../args/describe'
import { parseExtensionsArgs } from '../args/extensions'
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
      summary: 'A fake profile',
      aliases: ['fake'],
      fields: [{ name: 'title', type: 'string', docs: 'Display title' }],
      formats: [{ name: 'markdown', mediaType: 'text/markdown' }],
    },
  ],
  sources: [
    {
      id: 'fake.adapter',
      version: 1,
      summary: 'A fake adapter',
      profiles: [{ id: 'fake.kind', version: 1 }],
      routing: 'indexed',
      auth: { kind: 'none' },
      capabilities: ['retrieve'],
      config: { type: 'object' },
      configOptions: [
        {
          property: 'root_path',
          flag: '--config-root-path',
          type: 'string',
          required: true,
          docs: 'Root path',
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
      input: { type: 'object' },
      output: { id: 'fake.kind', version: 1 },
      docs: 'Run it',
      examples: [{ title: 'Example' }],
      adapters: [{ id: 'fake.adapter', version: 1 }],
    },
  ],
}

describe('describe interface', () => {
  test('parses selectors and formats and rejects invalid values', () => {
    expect(
      parseDescribeArgs(['profile', 'fake.kind', '--format', 'markdown']),
    ).toEqual({
      kind: 'describe',
      selector: 'profile',
      id: 'fake.kind',
      format: 'markdown',
    })
    expect(parseDescribeArgs(['--json'])).toEqual({
      kind: 'describe',
      format: 'json',
    })
    expect(parseDescribeArgs(['unknown'])).toMatchObject({ kind: 'unknown' })
    expect(parseDescribeArgs(['--format', 'yaml'])).toMatchObject({
      kind: 'unknown',
    })
    expect(parseDescribeArgs(['--unknown'])).toMatchObject({ kind: 'unknown' })
    expect(parseDescribeArgs(['--format'])).toMatchObject({ kind: 'unknown' })
    expect(parseDescribeArgs(['--json=false'])).toMatchObject({
      kind: 'unknown',
    })
  })

  test('filters exact ids and renders text, Markdown, and JSON data', () => {
    const selected = filterRegistryDescription(
      description,
      'adapter',
      'fake.adapter',
    )
    expect(selected).toBeDefined()
    if (!selected) throw new Error('expected selected Adapter')
    expect(registryJsonValue(selected, 'adapter')).toEqual(description.sources)
    expect(
      filterRegistryDescription(description, 'profile', 'missing'),
    ).toBeUndefined()
    expect(formatRegistryText(description)).toContain(
      '--config-root-path <string> required',
    )
    const text = formatRegistryText(description)
    expect(text).toContain('A fake profile')
    expect(text).toContain('title <string> - Display title')
    expect(text).toContain('markdown (text/markdown)')
    expect(text).toContain('A fake adapter')
    expect(text).toContain('Root path; default: "/notes"')
    expect(text).toContain('Run it')
    expect(text).toContain('examples: [{"title":"Example"}]')
    const markdown = formatRegistryMarkdown(description)
    expect(markdown).toContain('# ctxindex Registry')
    expect(markdown).toContain('`title` (string)')
    expect(markdown).toContain('Display title')
    expect(markdown).toContain('--config-root-path')
    expect(markdown).toContain('Adapter bindings: fake.adapter@1')
    expect(markdown).toContain('Examples: `[{"title":"Example"}]`')
  })
})

describe('extensions list interface', () => {
  test('supports only list and deterministic exact references', () => {
    expect(parseExtensionsArgs(['list', '--json'])).toEqual({
      kind: 'list',
      json: true,
    })
    expect(parseExtensionsArgs(['install'])).toMatchObject({ kind: 'unknown' })
    expect(parseExtensionsArgs(['list', '--unknown'])).toMatchObject({
      kind: 'unknown',
    })
    expect(parseExtensionsArgs(['list', '--json=false'])).toMatchObject({
      kind: 'unknown',
    })
    const registry = {
      list: () => [
        {
          id: 'external',
          version: 1,
          profiles: [
            { id: 'z', version: 1 },
            { id: 'a', version: 1 },
          ],
          adapters: [{ id: 'b', version: 2 }],
          docs: { summary: 'External proof' },
        },
      ],
    }
    expect(formatExtensions(registry, false)).toBe(
      'external@1\tExternal proof\tProfiles: a@1, z@1\tAdapters: b@2',
    )
    expect(JSON.parse(formatExtensions(registry, true))).toEqual([
      {
        id: 'external',
        version: 1,
        profiles: [
          { id: 'a', version: 1 },
          { id: 'z', version: 1 },
        ],
        adapters: [{ id: 'b', version: 2 }],
        summary: 'External proof',
      },
    ])
  })
})
