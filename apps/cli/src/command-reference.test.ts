import { expect, test } from 'bun:test'
import { defineCtxCommand, projectCommandReference } from './command-model'
import { renderCommandReferenceMarkdown } from './command-reference'

test('renders deterministic Markdown from the command projection', async () => {
  const root = defineCtxCommand({
    meta: { name: 'ctxindex', description: 'Fixture CLI' },
    subCommands: {
      search: defineCtxCommand({
        meta: { name: 'search', description: 'Search context.' },
        args: {
          query: {
            type: 'positional',
            required: false,
            description: 'Query text',
          },
          realm: {
            type: 'string',
            multiple: true,
            alias: 'r',
            description: 'Exact Realm',
          },
        },
      }),
    },
  })

  const markdown = renderCommandReferenceMarkdown(
    await projectCommandReference(root),
  )

  expect(markdown).toContain(
    '{/* Generated from the Citty command tree. Do not edit by hand. */}',
  )
  expect(markdown).toContain('## `ctxindex search`')
  expect(markdown).toContain('Search context.')
  expect(markdown).toContain('ctxindex search')
  expect(markdown).toContain('`--realm`, `-r`')
  expect(markdown).toContain('Repeatable')
})
