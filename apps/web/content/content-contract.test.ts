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
  test('starts with a complete providerless first-success path', async () => {
    const index = await readFile(join(docsRoot, 'index.mdx'), 'utf8')

    expect(index).toContain('bun add --global ctxindex')
    expect(index).toContain('ctxindex source add local.directory')
    expect(index).toContain('ctxindex sync --source work-files --format json')
    expect(index).toContain('ctxindex search "Aurora kickoff"')
    expect(index).toContain('"ref": "ctx://')
    expect(index).toContain('## Next')
    expect(index).not.toMatch(
      /^## (Start|Use|Extend|Reference and contribute)$/mu,
    )
  })

  test('keeps one current page for each public workflow', async () => {
    const [agentUsage, mail, calendar, contribute] = await Promise.all([
      readFile(join(docsRoot, 'start', 'agent-usage.mdx'), 'utf8'),
      readFile(join(docsRoot, 'use', 'mail.mdx'), 'utf8'),
      readFile(join(docsRoot, 'use', 'calendar.mdx'), 'utf8'),
      readFile(join(docsRoot, 'contribute', 'index.mdx'), 'utf8'),
    ])

    expect(agentUsage).toContain('ctxindex describe --full --format json')
    expect(agentUsage).toContain('--kind mail.message')
    expect(mail).toContain('--kind mail.message')
    expect(calendar).toContain('--kind calendar.event')
    expect(contribute).toContain('bun run test:integration')

    for (const legacyPath of [
      join(docsRoot, 'start', 'index.mdx'),
      join(docsRoot, 'use', 'workflows.mdx'),
      join(docsRoot, 'guides', 'agent-integration.mdx'),
      join(docsRoot, 'guides', 'mail-workflows.mdx'),
      join(docsRoot, 'guides', 'calendar-workflows.mdx'),
      join(docsRoot, 'examples', 'index.mdx'),
      join(docsRoot, 'examples', 'marketplace.mdx'),
      join(docsRoot, 'contribute', 'development.mdx'),
      join(docsRoot, 'contribute', 'architecture-design.mdx'),
    ]) {
      expect(await exists(legacyPath)).toBe(false)
    }

    const authored = `${agentUsage}\n${mail}\n${calendar}`
    expect(authored).not.toMatch(
      /--kind (?:mail|message|events|calendar-event)(?:\s|\\)/u,
    )
  })

  test('does not present bundled OAuth Apps as provider-verified', async () => {
    const connectProvider = await readFile(
      join(docsRoot, 'start', 'connect-provider.mdx'),
      'utf8',
    )

    expect(connectProvider).toContain('<Callout type="warn">')
    expect(connectProvider).toContain('OAuth Apps are not verified')
    expect(connectProvider).toContain('Microsoft should still work')
    expect(connectProvider).toContain('I maintain')
    expect(connectProvider).toContain('as an individual')
    expect(connectProvider).toContain('several weeks')
    expect(connectProvider).toContain('organizational tenants')
    expect(connectProvider).toContain('Google')
    expect(connectProvider).toContain('test users')
    expect(connectProvider).toContain('BYOA')
  })

  test('uses diagrams only for the core workflow and definition graphs', async () => {
    const [workflow, connectProvider, extensions] = await Promise.all([
      readFile(join(docsRoot, 'use', 'index.mdx'), 'utf8'),
      readFile(join(docsRoot, 'start', 'connect-provider.mdx'), 'utf8'),
      readFile(join(docsRoot, 'extend', 'index.mdx'), 'utf8'),
    ])

    expect(workflow).toContain('```mermaid')
    expect(workflow).toContain('Source -->|sync|')
    expect(workflow).toContain('Source -->|remote search|')
    expect(workflow).toContain('Get, thread, or export')
    expect(connectProvider).toContain('```mermaid')
    expect(connectProvider).toContain('Bundled managed App')
    expect(connectProvider).toContain('Local BYOA App')
    expect(extensions).toContain('```mermaid')
  })

  test('renders Mermaid fences instead of exposing diagram source', async () => {
    const [sourceConfig, mdxComponents, mermaidComponent] = await Promise.all([
      readFile(join(import.meta.dir, '..', 'source.config.ts'), 'utf8'),
      readFile(join(import.meta.dir, '..', 'components', 'mdx.tsx'), 'utf8'),
      readFile(
        join(import.meta.dir, '..', 'components', 'mermaid.tsx'),
        'utf8',
      ),
    ])

    expect(sourceConfig).toContain('remarkMdxMermaid')
    expect(mdxComponents).toContain('Mermaid,')
    expect(mermaidComponent).toContain('renderMermaidSVG')
  })

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

    expect(providerless).toContain('barisgit/ctxindex-extensions')
    expect(providerless).toContain('defineAdapter')
    expect(providerless).toContain("docs: docs('./docs')")
    expect(providerBacked).toContain('barisgit/ctxindex-extensions')
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
