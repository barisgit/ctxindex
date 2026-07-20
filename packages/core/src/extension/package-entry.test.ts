import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  importPackageEntries,
  resolvePackageEntries,
  selectExactExtension,
} from './package-entry'

const sandboxes: string[] = []
const provenance = {
  origin: 'explicit-path' as const,
  packageName: '@ctxindex/fixture',
}

async function sandbox(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'ctxindex-package-entry-'))
  sandboxes.push(path)
  return path
}

afterEach(async () => {
  await Promise.all(
    sandboxes.splice(0).map((path) => rm(path, { recursive: true })),
  )
})

describe('package Extension entries', () => {
  test('resolves ordered unique contained module paths', async () => {
    const root = await sandbox()
    await mkdir(join(root, 'dist'))
    await writeFile(join(root, 'dist', 'one.mjs'), 'export const one = 1\n')
    await writeFile(join(root, 'dist', 'two.mjs'), 'export const two = 2\n')

    const resolved = await resolvePackageEntries(
      root,
      {
        ctxindex: {
          extensions: ['./dist/two.mjs', './dist/one.mjs'],
        },
      },
      provenance,
    )

    expect(resolved.entries).toEqual([
      await realpath(join(root, 'dist', 'two.mjs')),
      await realpath(join(root, 'dist', 'one.mjs')),
    ])
    expect(resolved.provenance).toEqual(provenance)
  })

  test('imports each entry once and collects all plain Extension exports', async () => {
    const root = await sandbox()
    const counter = `__ctxindex_entry_${Date.now()}_${Math.random()}`
    const entry = join(root, 'entry.mjs')
    await writeFile(
      entry,
      `globalThis[${JSON.stringify(counter)}] = (globalThis[${JSON.stringify(counter)}] ?? 0) + 1
const extension = (id) => ({ kind: 'extension', id, providers: [], oauthApps: [], profiles: [], adapters: [] })
export default extension('fixture.default')
export const named = extension('fixture.named')
export const supporting = { kind: 'profile', id: 'fixture.note', version: 1 }
export function legacyCallback() { globalThis[${JSON.stringify(counter)}] += 100; return extension('fixture.callback') }
`,
    )
    const resolved = await resolvePackageEntries(
      root,
      { ctxindex: { extensions: ['./entry.mjs'] } },
      provenance,
    )

    const collected = await importPackageEntries(resolved)

    expect(
      collected.map(({ definition, provenance: rootProvenance }) => [
        definition.id,
        rootProvenance.exportName,
      ]),
    ).toEqual([
      ['fixture.default', 'default'],
      ['fixture.named', 'named'],
    ])
    expect((globalThis as Record<string, unknown>)[counter]).toBe(1)
    delete (globalThis as Record<string, unknown>)[counter]
  })

  test('selects one exact Extension id with absence and ambiguity diagnostics', () => {
    const definition = {
      kind: 'extension',
      id: 'fixture.selected',
      providers: [],
      oauthApps: [],
      profiles: [],
      adapters: [],
    } as const
    const collected = [
      {
        definition,
        provenance: {
          ...provenance,
          entry: '/fixture/one.mjs',
          exportName: 'one',
        },
      },
      {
        definition,
        provenance: {
          ...provenance,
          entry: '/fixture/two.mjs',
          exportName: 'two',
        },
      },
    ]

    const first = collected[0]
    if (first === undefined) throw new Error('missing fixture Extension')
    expect(selectExactExtension([first], definition.id)).toBe(first)
    expect(() => selectExactExtension(collected, definition.id)).toThrow(
      'Requested Extension is ambiguous across exports',
    )
    expect(() => selectExactExtension(collected, 'fixture.missing')).toThrow(
      'Requested Extension was not exported',
    )
  })

  test('rejects duplicate paths and export-symbol selectors', async () => {
    const root = await sandbox()
    await writeFile(join(root, 'entry.mjs'), 'export default {}\n')

    await expect(
      resolvePackageEntries(
        root,
        { ctxindex: { extensions: ['./entry.mjs', 'entry.mjs'] } },
        provenance,
      ),
    ).rejects.toThrow('Duplicate Extension package entry')
    await expect(
      resolvePackageEntries(
        root,
        { ctxindex: { extensions: ['./entry.mjs#default'] } },
        provenance,
      ),
    ).rejects.toThrow('must be contained')
  })

  test('rejects traversal, escaping symlinks, missing files, and directories', async () => {
    const base = await sandbox()
    const root = join(base, 'package')
    await mkdir(root)
    await writeFile(join(base, 'outside.mjs'), 'export default {}\n')
    await symlink(join(base, 'outside.mjs'), join(root, 'escape.mjs'))
    await mkdir(join(root, 'directory'))

    await expect(
      resolvePackageEntries(
        root,
        { ctxindex: { extensions: ['../outside.mjs'] } },
        provenance,
      ),
    ).rejects.toThrow('escapes package root')
    await expect(
      resolvePackageEntries(
        root,
        { ctxindex: { extensions: ['./escape.mjs'] } },
        provenance,
      ),
    ).rejects.toThrow('escapes package root')
    await expect(
      resolvePackageEntries(
        root,
        { ctxindex: { extensions: ['./missing.mjs'] } },
        provenance,
      ),
    ).rejects.toThrow()
    await expect(
      resolvePackageEntries(
        root,
        { ctxindex: { extensions: ['./directory'] } },
        provenance,
      ),
    ).rejects.toThrow('is not a file')
  })
})
