import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildBundledDocumentationManifest } from './manifest.macro'

test('builds an ordered bounded manifest from explicit authored roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-docs-manifest-'))
  try {
    await mkdir(join(root, 'guides'))
    await mkdir(join(root, 'images'))
    await writeFile(
      join(root, 'index.mdx'),
      '---\ntitle: Home\ndescription: Product docs.\n---\n\n[Start](guides/index.mdx)\n\n![Pixel](images/pixel.png)\n\n[Web](/docs/start) [External](https://example.test/docs)',
    )
    await writeFile(
      join(root, 'guides/index.mdx'),
      "---\ntitle: Start\n---\n\nimport { Callout } from 'fumadocs-ui/components/callout';\n\n<Callout>\n  Safe text.\n</Callout>",
    )
    await writeFile(
      join(root, 'images/pixel.png'),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
    )
    const manifest = buildBundledDocumentationManifest([
      { root, logicalPrefix: '', exclude: [] },
    ])
    expect(manifest).toEqual([
      expect.objectContaining({
        path: 'README.md',
        title: 'Home',
        summary: 'Product docs.',
      }),
      expect.objectContaining({ path: 'guides/README.md', title: 'Start' }),
      expect.objectContaining({ path: 'images/pixel.png', kind: 'asset' }),
    ])
    const home = Buffer.from(
      manifest[0]?.contentBase64 ?? '',
      'base64',
    ).toString('utf8')
    expect(home).toContain('[Start](guides/README.md)')
    expect(home).toContain('![Pixel](images/pixel.png)')
    expect(home).toContain('[Web](/docs/start)')
    expect(home).toContain('[External](https://example.test/docs)')
    const content = Buffer.from(
      manifest[1]?.contentBase64 ?? '',
      'base64',
    ).toString('utf8')
    expect(content).not.toContain('fumadocs-ui')
    expect(content).toContain('> Safe text.')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects broken references, duplicate logical paths, and symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-docs-invalid-'))
  try {
    await writeFile(join(root, 'index.mdx'), '[Missing](missing.mdx)')
    expect(() =>
      buildBundledDocumentationManifest([
        { root, logicalPrefix: '', exclude: [] },
      ]),
    ).toThrow('Broken bundled documentation reference')

    await writeFile(join(root, 'index.mdx'), '# Home')
    await symlink(join(root, 'index.mdx'), join(root, 'linked.mdx'))
    expect(() =>
      buildBundledDocumentationManifest([
        { root, logicalPrefix: '', exclude: [] },
      ]),
    ).toThrow('symbolic link')

    await rm(join(root, 'linked.mdx'))
    expect(() =>
      buildBundledDocumentationManifest([
        { root, logicalPrefix: '', exclude: [] },
        { root, logicalPrefix: '', exclude: [] },
      ]),
    ).toThrow('duplicate path README.md')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
