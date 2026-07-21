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
import { importExtensionDefinition } from './import'
import {
  importPackageEntries,
  inspectPackageEntries,
  resolvePackageEntries,
  selectCatalogLiteral,
  selectExactCatalog,
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
  test('inspects Extension and Catalog roots without export-name selection', async () => {
    const root = await sandbox()
    const counter = `__ctxindex_catalog_entry_${Date.now()}_${Math.random()}`
    await writeFile(
      join(root, 'entry.mjs'),
      `globalThis[${JSON.stringify(counter)}] = (globalThis[${JSON.stringify(counter)}] ?? 0) + 1
const extension = (id) => ({ kind: 'extension', id, providers: [], oauthApps: [], profiles: [], adapters: [] })
const literal = extension('fixture.literal')
export const extensionRoot = extension('fixture.top-level')
export const catalogRoot = { kind: 'catalog', id: 'fixture.catalog', label: 'Fixture', extensions: [literal] }
export const futureRoot = { kind: 'future-definition', id: 'fixture.future' }
`,
    )
    const resolved = await resolvePackageEntries(
      root,
      { ctxindex: { extensions: ['./entry.mjs'] } },
      provenance,
    )

    const inspected = await inspectPackageEntries(resolved)
    expect(
      inspected.map(({ definition, modulePath }) => ({
        kind: definition.kind,
        id: definition.id,
        modulePath,
      })),
    ).toEqual([
      {
        kind: 'catalog',
        id: 'fixture.catalog',
        modulePath: await realpath(join(root, 'entry.mjs')),
      },
      {
        kind: 'extension',
        id: 'fixture.top-level',
        modulePath: await realpath(join(root, 'entry.mjs')),
      },
    ])
    expect(Object.keys(inspected[0] ?? {})).not.toContain('exportName')
    expect((globalThis as Record<string, unknown>)[counter]).toBe(1)

    const selected = selectExactCatalog(inspected, 'fixture.catalog')
    const literal = selected.definition.extensions[0]
    if (literal === undefined || literal.kind !== 'extension')
      throw new Error('missing literal fixture')
    expect(
      selectCatalogLiteral(selected.definition, 0, 'fixture.literal'),
    ).toBe(literal)
    expect(() =>
      selectCatalogLiteral(selected.definition, 1, 'fixture.literal'),
    ).toThrow('entry index')
    expect(() =>
      selectCatalogLiteral(selected.definition, 0, 'fixture.other'),
    ).toThrow('identity')
    delete (globalThis as Record<string, unknown>)[counter]
  })

  test('inspects Catalog entry summaries for literal and package entries', async () => {
    const root = await sandbox()
    await writeFile(
      join(root, 'entry.mjs'),
      `const literal = { kind: 'extension', id: 'fixture.literal', providers: [], oauthApps: [], profiles: [], adapters: [] }
const packageEntry = { kind: 'package-extension', source: { kind: 'npm', target: '@fixture/package@^1' }, extensionId: 'fixture.package' }
export default {
  kind: 'catalog',
  id: 'fixture.catalog',
  label: 'Fixture',
  summary: 'Catalog summary.',
  entrySummaries: {
    'fixture.literal': 'Literal summary.',
    'fixture.package': 'Package summary.',
  },
  extensions: [literal, packageEntry],
}
`,
    )
    const resolved = await resolvePackageEntries(
      root,
      { ctxindex: { extensions: ['./entry.mjs'] } },
      provenance,
    )

    const inspected = await inspectPackageEntries(resolved)

    expect(inspected).toHaveLength(1)
    expect(inspected[0]?.definition).toMatchObject({
      kind: 'catalog',
      summary: 'Catalog summary.',
      entrySummaries: {
        'fixture.literal': 'Literal summary.',
        'fixture.package': 'Package summary.',
      },
    })
  })

  test.each([
    ['non-object map', '[]'],
    ['unknown entry id', `{ 'fixture.missing': 'Missing.' }`],
    ['empty summary', `{ 'fixture.literal': '' }`],
    ['non-string summary', `{ 'fixture.literal': 1 }`],
  ])('rejects Catalog entry summaries with an invalid %s', async (_label, map) => {
    const root = await sandbox()
    await writeFile(
      join(root, 'entry.mjs'),
      `const literal = { kind: 'extension', id: 'fixture.literal', providers: [], oauthApps: [], profiles: [], adapters: [] }
export default {
  kind: 'catalog',
  id: 'fixture.catalog',
  label: 'Fixture',
  entrySummaries: ${map},
  extensions: [literal],
}
`,
    )
    const resolved = await resolvePackageEntries(
      root,
      { ctxindex: { extensions: ['./entry.mjs'] } },
      provenance,
    )

    await expect(inspectPackageEntries(resolved)).rejects.toThrow(
      'Invalid Catalog export',
    )
  })

  test.each([
    ['malformed Extension', `{ kind: 'extension', id: 'fixture.invalid' }`],
    [
      'malformed Catalog',
      `{ kind: 'catalog', id: 'fixture.invalid', label: 'Invalid', extensions: ['fixture.ref'] }`,
    ],
  ])('rejects a %s root', async (_label, value) => {
    const root = await sandbox()
    await writeFile(join(root, 'entry.mjs'), `export default ${value}\n`)
    const resolved = await resolvePackageEntries(
      root,
      { ctxindex: { extensions: ['./entry.mjs'] } },
      provenance,
    )
    await expect(inspectPackageEntries(resolved)).rejects.toThrow()
  })

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

  test('exact selection ignores invalid documentation on an unselected sibling', async () => {
    const root = await sandbox()
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ ctxindex: { extensions: ['./entry.mjs'] } }),
    )
    await writeFile(
      join(root, 'entry.mjs'),
      `const extension = (id, docs) => ({ kind: 'extension', id, providers: [], oauthApps: [], profiles: [], adapters: [], ...(docs === undefined ? {} : { docs }) })
export const selected = extension('fixture.selected')
export const sibling = extension('fixture.sibling', { kind: 'directory', path: './docs' })
`,
    )

    await expect(
      importExtensionDefinition(root, 'fixture.selected'),
    ).resolves.toMatchObject({ id: 'fixture.selected' })

    const resolved = await resolvePackageEntries(
      root,
      { ctxindex: { extensions: ['./entry.mjs'] } },
      provenance,
    )
    await expect(importPackageEntries(resolved)).rejects.toThrow(
      'Invalid Extension documentation',
    )
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
