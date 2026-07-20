import { expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
  docs,
  z,
} from '@ctxindex/extension-sdk'
import type { CollectedExtension } from '../registry'
import {
  createDocumentationProjection,
  resolveCollectedExtensionDocumentation,
} from './documentation'

const first = defineProfile({
  id: 'fixture.note',
  version: 1,
  schema: z.object({ body: z.string() }),
})
const second = defineProfile({
  id: 'fixture.note',
  version: 2,
  schema: z.object({ body: z.string(), revised: z.boolean() }),
})

function collected(
  definition: ReturnType<typeof defineExtension>,
): CollectedExtension {
  return {
    definition,
    provenance: {
      origin: 'builtin',
      entry: 'builtin:fixture',
      exportName: 'fixture',
    },
  }
}

test('projects authored docs and deterministic generated truth separately', async () => {
  const adapter = defineAdapter({
    id: 'fixture.notes',
    configSchema: z.object({ folder: z.string() }),
    profiles: [first],
    routing: 'indexed',
    capabilities: ['sync'],
    operations: { sync: async () => {} },
    actions: {},
  })
  const root = await resolveCollectedExtensionDocumentation(
    collected(
      defineExtension({
        id: 'fixture.documented',
        adapters: [adapter],
        docs: docs({
          index: 'README.md',
          files: [
            {
              path: 'README.md',
              kind: 'markdown',
              mediaType: 'text/markdown',
              content: '# Authored claim\n\nSupports an imaginary option.',
            },
            {
              path: 'profiles/fixture.note@1.md',
              kind: 'markdown',
              mediaType: 'text/markdown',
              content: '# Authored profile',
            },
          ],
        }),
      }),
    ),
  )

  const projection = createDocumentationProjection([root])
  expect(projection.get('fixture.documented', 'README.md')).toMatchObject({
    origin: 'authored',
    content: '# Authored claim\n\nSupports an imaginary option.',
  })
  expect(
    projection.get('fixture.documented', 'profiles/fixture.note.md'),
  ).toMatchObject({
    origin: 'authored',
    aliasOf: 'profiles/fixture.note@1.md',
  })
  const generated = projection.get(
    'fixture.documented',
    'generated/adapters/fixture.notes.json',
  )
  expect(generated).toMatchObject({
    origin: 'generated',
    kind: 'metadata',
    mediaType: 'application/json',
  })
  expect(JSON.parse(generated?.content as string)).toMatchObject({
    id: 'fixture.notes',
    capabilities: ['sync'],
    configSchema: {
      properties: { folder: { type: 'string' } },
    },
  })
  expect(generated?.content).not.toContain('imaginary')
  expect(
    projection.get(
      'fixture.documented',
      'generated/profiles/fixture.note@1.json',
    ),
  ).toMatchObject({
    definition: { kind: 'profile', id: 'fixture.note', version: 1 },
  })
  expect(JSON.stringify(projection.list())).not.toContain('builtin:fixture')
})

test('omits an unversioned Profile alias when authored versions are ambiguous', async () => {
  const roots = await Promise.all(
    [first, second].map((profile) =>
      resolveCollectedExtensionDocumentation(
        collected(
          defineExtension({
            id: `fixture.documented-v${profile.version}`,
            profiles: [profile],
            docs: docs({
              index: 'README.md',
              files: [
                {
                  path: 'README.md',
                  kind: 'markdown',
                  mediaType: 'text/markdown',
                  content: '# Fixture',
                },
                {
                  path: `profiles/fixture.note@${profile.version}.md`,
                  kind: 'markdown',
                  mediaType: 'text/markdown',
                  content: '# Profile',
                },
              ],
            }),
          }),
        ),
      ),
    ),
  )

  const projection = createDocumentationProjection(roots)
  expect(
    projection.list().some(({ path }) => path === 'profiles/fixture.note.md'),
  ).toBe(false)
  expect(
    projection
      .list()
      .filter(({ definition }) => definition?.kind === 'profile'),
  ).toHaveLength(4)
})

test('projects duplicate Adapter ids once under canonical generated paths', () => {
  const adapter = defineAdapter({
    id: 'fixture.safe',
    configSchema: z.object({}),
    profiles: [],
    routing: 'federated',
    capabilities: [],
    operations: {},
    actions: {},
  })
  const projection = createDocumentationProjection([
    collected(
      defineExtension({
        id: 'fixture.generated-paths',
        adapters: [adapter, adapter],
      }),
    ),
  ])

  expect(
    projection
      .list()
      .filter(({ extensionId }) => extensionId === 'fixture.generated-paths')
      .map(({ path }) => path)
      .filter((path) => path.includes('adapters/')),
  ).toEqual(['generated/adapters/fixture.safe.json'])
})
