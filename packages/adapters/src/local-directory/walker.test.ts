import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
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

function rels(entries: readonly { relativePath: string }[]): string[] {
  return entries.map((e) => e.relativePath).sort()
}

describe('walkDirectory', () => {
  test('applies the SPEC §5 built-in ignore globs', async () => {
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
    expect(rels((await walkDirectory(root)).entries)).toEqual(['keep.ts'])
  })

  test('include patterns use glob semantics, not substring matching', async () => {
    const root = await fixture({
      'notes.md': '# notes',
      'readme.md': '# readme',
      'main.ts': 'export {}',
      'mdfile.ts': 'export {}', // would wrongly match a substring "md" filter
    })
    const result = await walkDirectory(root, { include: ['*.md'] })
    expect(rels(result.entries)).toEqual(['notes.md', 'readme.md'])
  })

  test('.ctxindexignore negation can re-include a gitignored path', async () => {
    const root = await fixture({
      'app.log': 'log',
      'keep.txt': 'keep',
      '.gitignore': '*.log\n',
      '.ctxindexignore': '!app.log\n',
    })
    expect(rels((await walkDirectory(root)).entries)).toContain('app.log')
  })

  test('.ctxindexignore must unignore a parent before re-including its child', async () => {
    const root = await fixture({
      'ignored/keep.txt': 'keep',
      '.gitignore': 'ignored/\n',
      '.ctxindexignore': '!ignored/keep.txt\n',
    })
    expect(rels((await walkDirectory(root)).entries)).toEqual([])

    await writeFile(
      join(root, '.ctxindexignore'),
      '!ignored/\n!ignored/keep.txt\n',
    )
    expect(rels((await walkDirectory(root)).entries)).toEqual([
      'ignored/keep.txt',
    ])
  })

  test('returns deterministic nested paths and lets .ctxindexignore override exclusions', async () => {
    const root = await fixture({
      'z.txt': 'z',
      'nested/b.txt': 'b',
      'nested/a.txt': 'a',
      'nested/reinclude.txt': 'include',
      '.ctxindexignore': '!nested/reinclude.txt\n',
    })
    const result = await walkDirectory(root, {
      exclude: ['nested/reinclude.txt'],
    })
    expect(rels(result.entries)).toEqual([
      'nested/a.txt',
      'nested/b.txt',
      'nested/reinclude.txt',
      'z.txt',
    ])
  })

  test('requires an existing directory root', async () => {
    const root = await fixture({ 'file.txt': 'text' })
    const missing = join(root, 'missing')
    await expect(walkDirectory(missing)).rejects.toThrow(
      'local.directory root_path does not exist',
    )
    try {
      await walkDirectory(missing)
    } catch (error) {
      expect(String(error)).not.toContain(root)
    }
    await expect(walkDirectory(join(root, 'file.txt'))).rejects.toThrow()
  })

  test('never follows symlinks and reports only relative warning paths', async () => {
    const outside = await fixture({ 'secret.txt': 'secret' })
    const root = await fixture({ 'keep.txt': 'keep' })
    await symlink(outside, join(root, 'outside-link'))

    const result = await walkDirectory(root)

    expect(rels(result.entries)).toEqual(['keep.txt'])
    expect(result.warnings).toEqual([
      {
        code: 'symlink_skipped',
        message: 'Skipped symbolic link: outside-link',
        path: 'outside-link',
      },
    ])
    expect(JSON.stringify(result.warnings)).not.toContain(root)
    expect(JSON.stringify(result.warnings)).not.toContain(outside)
  })

  test('prunes ignored directories before inspecting their contents', async () => {
    const outside = await fixture({ 'secret.txt': 'secret' })
    const root = await fixture({ 'keep.txt': 'keep' })
    for (const directory of ['node_modules/pkg', '.git/objects', 'excluded']) {
      await mkdir(join(root, directory), { recursive: true })
      await symlink(outside, join(root, directory, 'outside-link'))
    }

    const result = await walkDirectory(root, { exclude: ['excluded/'] })

    expect(rels(result.entries)).toEqual(['keep.txt'])
    expect(result.warnings).toEqual([])
  })

  test('skips a Unix filename containing a literal backslash without collision', async () => {
    if (process.platform === 'win32') return
    const root = await fixture({ 'literal/name.txt': 'nested' })
    await writeFile(join(root, 'literal\\name.txt'), 'backslash')

    const result = await walkDirectory(root)

    expect(rels(result.entries)).toEqual(['literal/name.txt'])
    expect(result.warnings).toContainEqual({
      code: 'invalid_path_skipped',
      message: 'Skipped non-POSIX filename',
      path: 'literal\\name.txt',
    })
  })
})
