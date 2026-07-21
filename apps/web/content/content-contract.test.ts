import { describe, expect, test } from 'bun:test'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const docsRoot = join(import.meta.dir, 'docs')

async function collectMdx(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return collectMdx(path)
      return entry.isFile() && entry.name.endsWith('.mdx') ? [path] : []
    }),
  )
  return files.flat()
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function hasDocsRoute(route: string): Promise<boolean> {
  const slug = route.replace(/^\/docs\/?/u, '').replace(/\/$/u, '')
  if (slug.length === 0) return exists(join(docsRoot, 'index.mdx'))
  return (
    (await exists(join(docsRoot, `${slug}.mdx`))) ||
    (await exists(join(docsRoot, slug, 'index.mdx')))
  )
}

describe('public documentation information architecture', () => {
  test('prioritizes Start, Use, Extend, Reference, and Contribute', async () => {
    const meta = JSON.parse(await readFile(join(docsRoot, 'meta.json'), 'utf8'))
    expect(meta.pages).toEqual([
      'index',
      'start',
      'use',
      'extend',
      'reference',
      'contribute',
    ])
    expect(meta.pages).not.toContain('cli')
  })

  test('publishes both checked Extension authoring lanes', async () => {
    const providerless = await readFile(
      join(docsRoot, 'extend/providerless.mdx'),
      'utf8',
    )
    const providerBacked = await readFile(
      join(docsRoot, 'extend/provider-backed.mdx'),
      'utf8',
    )

    expect(providerless).toContain('examples/tenders-extension')
    expect(providerless).toContain('defineAdapter')
    expect(providerless).toContain("docs: docs('./docs')")
    expect(providerBacked).toContain('examples/issues-extension')
    expect(providerBacked).toContain('defineOAuthApp')
    expect(providerBacked).toContain("access: { scopes: ['issues.read'] }")
  })

  test('resolves every authored absolute docs link', async () => {
    const unresolved: string[] = []
    for (const path of await collectMdx(docsRoot)) {
      const source = await readFile(path, 'utf8')
      const routes = source.matchAll(
        /\]\((\/docs(?:\/[^)#\s]*)?)(?:#[^)]+)?\)/gu,
      )
      for (const match of routes) {
        const route = match[1]
        if (route && !(await hasDocsRoute(route))) {
          unresolved.push(`${path.replace(`${docsRoot}/`, '')}: ${route}`)
        }
      }
    }
    expect(unresolved).toEqual([])
  })
})
