import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  type AnyExtensionDefinition,
  defineAdapter,
  defineExtension,
  defineProfile,
  defineProvider,
  docs,
  z,
} from '@ctxindex/extension-sdk'
import { createSandbox } from '../testing'
import { resolveExtensionDocumentation } from './documentation'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const profile = defineProfile({
  id: 'fixture.note',
  version: 2,
  schema: z.object({ body: z.string() }),
})
const provider = defineProvider({ id: 'fixture', auth: { kind: 'none' } })
const adapter = defineAdapter({
  id: 'fixture.notes',
  provider,
  configSchema: z.object({}),
  profiles: [profile],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

test('normalizes passive virtual documentation and exact definition routes', async () => {
  const extension = defineExtension({
    id: 'fixture.documented',
    providers: [provider],
    profiles: [profile],
    adapters: [adapter],
    docs: docs({
      index: 'README.md',
      files: [
        {
          path: 'README.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          content:
            '---\ntitle: Fixture\norder: 1\n---\n# Fixture\n\n[Guide](guides/start.md)\n![Logo](assets/logo.png)',
        },
        {
          path: 'guides/start.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          content: '# Start',
        },
        {
          path: 'providers/fixture.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          content: '# Provider',
        },
        {
          path: 'adapters/fixture.notes.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          content: '# Adapter',
        },
        {
          path: 'profiles/fixture.note@2.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          content: '# Profile',
        },
        {
          path: 'assets/logo.png',
          kind: 'asset',
          mediaType: 'image/png',
          content: png,
        },
      ],
    }),
  })

  const resolved = await resolveExtensionDocumentation(extension)

  expect(resolved.definition).not.toHaveProperty('docs')
  expect(resolved.documentation?.files.map(({ path }) => path)).toEqual([
    'README.md',
    'adapters/fixture.notes.md',
    'assets/logo.png',
    'guides/start.md',
    'profiles/fixture.note@2.md',
    'providers/fixture.md',
  ])
  expect(resolved.documentation?.files[0]).toMatchObject({
    path: 'README.md',
    frontmatter: { title: 'Fixture', order: 1 },
  })
})

test.each([
  ['parent traversal', '../secret.md', '# no'],
  ['raw HTML', 'README.md', '<script>alert(1)</script>'],
  ['unsafe URL', 'README.md', '[bad](javascript:alert(1))'],
  ['remote image', 'README.md', '![bad](https://example.com/a.png)'],
])('rejects %s before returning a runtime definition', async (_, path, content) => {
  const extension = defineExtension({
    id: 'fixture.invalid-docs',
    docs: docs({
      index: 'README.md',
      files: [
        {
          path,
          kind: 'markdown',
          mediaType: 'text/markdown',
          content,
        },
        ...(path === 'README.md'
          ? []
          : [
              {
                path: 'README.md',
                kind: 'markdown' as const,
                mediaType: 'text/markdown' as const,
                content: '# Fixture',
              },
            ]),
      ],
    }),
  })

  await expect(resolveExtensionDocumentation(extension)).rejects.toThrow(
    'Invalid Extension documentation',
  )
})

test('binds ./docs to the definition module and rejects symlinks', async () => {
  const sandbox = await createSandbox()
  try {
    const packageRoot = join(sandbox.dir, 'package')
    const docsRoot = join(packageRoot, 'docs')
    await mkdir(docsRoot, { recursive: true })
    await writeFile(join(packageRoot, 'entry.ts'), 'export {}')
    await writeFile(join(docsRoot, 'README.md'), '# Fixture')

    const valid = defineExtension({
      id: 'fixture.directory-docs',
      docs: docs('./docs'),
    })
    const resolved = await resolveExtensionDocumentation(
      valid,
      pathToFileURL(join(packageRoot, 'entry.ts')),
    )
    expect(resolved.documentation?.files[0]).toMatchObject({
      path: 'README.md',
      content: '# Fixture',
    })

    const outside = await mkdtemp(join(sandbox.dir, 'outside-'))
    await writeFile(join(outside, 'secret.md'), 'secret')
    await symlink(join(outside, 'secret.md'), join(docsRoot, 'linked.md'))
    await expect(
      resolveExtensionDocumentation(
        valid,
        pathToFileURL(join(packageRoot, 'entry.ts')),
      ),
    ).rejects.toThrow('linked.md')
  } finally {
    await sandbox.cleanup()
  }
})

test('rejects an untyped Extension that supplies both declaration forms', async () => {
  const extension = {
    ...defineExtension({ id: 'fixture.invalid-both' }),
    docs: [docs('./docs'), docs({ index: 'README.md', files: [] })],
  } as unknown as AnyExtensionDefinition

  await expect(resolveExtensionDocumentation(extension)).rejects.toThrow(
    'Invalid Extension documentation at docs',
  )
})

test('binds canonical routes by value identity rather than object identity', async () => {
  const copiedProfile = { ...profile }
  const extension = defineExtension({
    id: 'fixture.copied-profile',
    profiles: [copiedProfile],
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
          path: 'profiles/fixture.note@2.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          content: '# Profile',
        },
      ],
    }),
  })

  const resolved = await resolveExtensionDocumentation(extension)
  expect(resolved.documentation?.files[1]).toMatchObject({
    definition: { kind: 'profile', id: 'fixture.note', version: 2 },
  })
  expect(copiedProfile).not.toBe(profile)
})

test('round-trips the maximum route-safe definition id in an authored route', async () => {
  const id = 'a'.repeat(128)
  const longAdapter = defineAdapter({
    id,
    configSchema: z.object({}),
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
  const resolved = await resolveExtensionDocumentation(
    defineExtension({
      id: 'fixture.boundary-route',
      adapters: [longAdapter],
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
            path: `adapters/${id}.md`,
            kind: 'markdown',
            mediaType: 'text/markdown',
            content: '# Boundary Adapter',
          },
        ],
      }),
    }),
  )

  expect(resolved.documentation?.files[1]).toMatchObject({
    path: `adapters/${id}.md`,
    definition: { kind: 'adapter', id },
  })
})
