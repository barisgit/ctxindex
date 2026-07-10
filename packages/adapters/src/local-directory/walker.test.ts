import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walkDirectory } from './walker'

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-walker-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    await mkdir(join(abs, '..'), { recursive: true })
    await writeFile(abs, content)
  }
  return root
}

function rels(entries: { relativePath: string }[]): string[] {
  return entries.map((e) => e.relativePath).sort()
}

describe('walkDirectory', () => {
  test('applies the V1 §1.3.1 built-in ignore globs', async () => {
    const root = await fixture({
      'keep.ts': 'export const x = 1',
      'target/out.bin': 'ignored',
      '.turbo/cache': 'ignored',
      'node_modules/dep/index.js': 'ignored',
      '.svelte-kit/build.js': 'ignored',
      'Cargo.lock': 'ignored',
      'bun.lockb': 'ignored',
      'uv.lock': 'ignored',
    })
    expect(rels(await walkDirectory(root))).toEqual(['keep.ts'])
  })

  test('include patterns use glob semantics, not substring matching', async () => {
    const root = await fixture({
      'notes.md': '# notes',
      'readme.md': '# readme',
      'main.ts': 'export {}',
      'mdfile.ts': 'export {}', // would wrongly match a substring "md" filter
    })
    const entries = await walkDirectory(root, { include: ['*.md'] })
    expect(rels(entries)).toEqual(['notes.md', 'readme.md'])
  })

  test('.ctxindexignore negation can re-include a gitignored path', async () => {
    const root = await fixture({
      'app.log': 'log',
      'keep.txt': 'keep',
      '.gitignore': '*.log\n',
      '.ctxindexignore': '!app.log\n',
    })
    expect(rels(await walkDirectory(root))).toContain('app.log')
  })
})
