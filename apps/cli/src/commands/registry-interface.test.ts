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
      full: false,
    })
    expect(parseDescribeArgs(['--json'])).toEqual({
      kind: 'describe',
      format: 'json',
      full: false,
    })
    expect(parseDescribeArgs(['action', '--full', '--json'])).toEqual({
      kind: 'describe',
      selector: 'action',
      format: 'json',
      full: true,
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
    expect(parseDescribeArgs(['action', 'fake.run', '--full'])).toMatchObject({
      kind: 'unknown',
      message: 'describe: --full is redundant with an exact id',
    })
    expect(parseDescribeArgs(['--full=false'])).toMatchObject({
      kind: 'unknown',
    })
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
    expect(text).toContain('A fake profile')
    expect(text).toContain('title <string> - Display title')
    expect(text).toContain('markdown (text/markdown)')
    expect(text).toContain('A fake adapter')
    expect(text).toContain('Root path; default: "/notes"')
    expect(text).toContain('Run it')
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
    expect(text).toContain('  examples:\n    [\n      {')
    expect(text).toContain('  auth: none')
    expect(text).not.toContain('auth: {"kind":"none"}')
    const markdown = formatRegistryMarkdown(description, 'full')
    expect(markdown).toContain('# ctxindex Registry')
    expect(markdown).toContain('`title` (string)')
    expect(markdown).toContain('Display title')
    expect(markdown).toContain('--config-root-path')
    expect(markdown).toContain('Adapter bindings: fake.adapter@1')
    expect(markdown).toContain('| `to` | `string[]` | yes |')
    expect(markdown).toContain('| `priority` | `integer` | no |')
    expect(markdown).toContain(
      'schema fragment: {"allOf":[{"type":"string","minLength":2}]}',
    )
    expect(markdown).toContain('Additional properties are not allowed.')
    expect(markdown).not.toContain('Input: `{"$schema"')
    expect(markdown).toContain('```json\n[')
    expect(markdown).toContain('- Auth: none')
  })

  test('projects compact lists, exact detail, and explicit full snapshots', () => {
    expect(registryJsonValue(description, undefined, 'compact')).toEqual({
      kinds: [
        {
          id: 'fake.kind',
          version: 1,
          summary: 'A fake profile',
          aliases: ['fake'],
        },
      ],
      sources: [
        {
          id: 'fake.adapter',
          version: 1,
          summary: 'A fake adapter',
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
          adapters: [{ id: 'fake.adapter', version: 1 }],
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
    expect(compactText).toContain('fake.kind@1 - A fake profile')
    expect(compactText).not.toContain('field title')
    expect(compactText).toContain(
      'Use `ctxindex describe <profile|adapter|action> <id>` for full details.',
    )
    const compactMarkdown = formatRegistryMarkdown(description, 'compact')
    expect(compactMarkdown).toContain('## Profiles (1)')
    expect(compactMarkdown).toContain('- `fake.kind@1` — A fake profile')
    expect(compactMarkdown).not.toContain('Fields:')
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
