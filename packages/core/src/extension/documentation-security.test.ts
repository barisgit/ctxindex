import { expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  type DocumentationFile,
  defineExtension,
  docs,
} from '@ctxindex/extension-sdk'
import { createSandbox } from '../testing'
import { resolveExtensionDocumentation } from './documentation'

const markdown = (path: string, content = '# Fixture'): DocumentationFile => ({
  path,
  kind: 'markdown',
  mediaType: 'text/markdown',
  content,
})

async function resolveFiles(files: readonly DocumentationFile[]) {
  return resolveExtensionDocumentation(
    defineExtension({
      id: 'fixture.security',
      docs: docs({ index: 'README.md', files }),
    }),
  )
}

test.each([
  ['missing index', [markdown('guides/start.md')]],
  [
    'case-fold collision',
    [
      markdown('README.md'),
      markdown('guides/Start.md'),
      markdown('guides/start.md'),
    ],
  ],
  [
    'non-canonical route',
    [markdown('README.md'), markdown('profiles/fixture.note.md')],
  ],
  [
    'unknown definition route',
    [markdown('README.md'), markdown('adapters/fixture.missing.md')],
  ],
  [
    'unsupported frontmatter',
    [
      markdown(
        'README.md',
        '---\ntitle: Fixture\nscript: nope\n---\n# Fixture',
      ),
    ],
  ],
  [
    'missing local target',
    [markdown('README.md', '[missing](guides/missing.md)')],
  ],
  [
    'dot segment reference',
    [
      markdown('README.md', '[guide](./guides/start.md)'),
      markdown('guides/start.md'),
    ],
  ],
  [
    'unsupported URL scheme',
    [markdown('README.md', '[bad](data:text/plain,secret)')],
  ],
  [
    'unsafe shortcut reference',
    [markdown('README.md', '[bad]: javascript:alert(1)\n\n[bad]')],
  ],
  [
    'remote shortcut image',
    [markdown('README.md', '[bad]: https://example.test/a.png\n\n![bad]')],
  ],
  ['processing instruction', [markdown('README.md', '<?unsafe instruction?>')]],
  ['document type', [markdown('README.md', '<!doctype html>')]],
  ['CDATA section', [markdown('README.md', '<![CDATA[unsafe]]>')]],
] as const)('rejects %s', async (_, files) => {
  await expect(resolveFiles(files)).rejects.toThrow(
    'Invalid Extension documentation',
  )
})

test('accepts passive fragment and HTTPS links without fetching them', async () => {
  const result = await resolveFiles([
    markdown(
      'README.md',
      '[section](#section) [site](https://example.test/path) <https://example.test/docs>',
    ),
  ])
  expect(result.documentation?.files).toHaveLength(1)
})

test('enforces fixed file, depth, path, Markdown, and reference bounds', async () => {
  const tooMany = [markdown('README.md')]
  for (let index = 0; index < 256; index += 1)
    tooMany.push(markdown(`guides/${index}.md`))
  await expect(resolveFiles(tooMany)).rejects.toThrow(
    'Invalid Extension documentation',
  )
  await expect(
    resolveFiles([
      markdown('README.md'),
      markdown('assets/a/b/c/d/e/f/g/h.png'),
    ]),
  ).rejects.toThrow('assets/a/b/c/d/e/f/g/h.png')
  await expect(
    resolveFiles([
      markdown('README.md'),
      markdown(`guides/${'x'.repeat(505)}.md`),
    ]),
  ).rejects.toThrow('Invalid Extension documentation')
  await expect(
    resolveFiles([markdown('README.md', 'x'.repeat(256 * 1024 + 1))]),
  ).rejects.toThrow('README.md')
  await expect(
    resolveFiles([
      markdown(
        'README.md',
        Array.from({ length: 513 }, (_, index) => `[${index}](#ok)`).join(' '),
      ),
    ]),
  ).rejects.toThrow('README.md')
})

test('requires declared image media, file extension, and magic bytes to agree', async () => {
  await expect(
    resolveFiles([
      markdown('README.md'),
      {
        path: 'assets/fake.png',
        kind: 'asset',
        mediaType: 'image/png',
        content: new Uint8Array([0, 1, 2, 3]),
      },
    ]),
  ).rejects.toThrow('assets/fake.png')
  await expect(
    resolveFiles([
      markdown('README.md'),
      {
        path: 'assets/vector.svg',
        kind: 'asset',
        mediaType: 'image/png',
        content: new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
      },
    ]),
  ).rejects.toThrow('assets/vector.svg')
})

test('directory and virtual trees reject the same invalid reference', async () => {
  const virtualError = resolveFiles([
    markdown('README.md', '[missing](guides/missing.md)'),
  ]).catch((cause: Error) => cause.message)
  const sandbox = await createSandbox()
  try {
    const root = join(sandbox.dir, 'package')
    await mkdir(join(root, 'docs'), { recursive: true })
    await writeFile(join(root, 'entry.ts'), 'export {}')
    await writeFile(
      join(root, 'docs/README.md'),
      '[missing](guides/missing.md)',
    )
    const directoryError = resolveExtensionDocumentation(
      defineExtension({ id: 'fixture.directory', docs: docs('./docs') }),
      pathToFileURL(join(root, 'entry.ts')),
    ).catch((cause: Error) => cause.message)
    expect(await directoryError).toBe(await virtualError)
  } finally {
    await sandbox.cleanup()
  }
})
