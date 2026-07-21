import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { SEARCH_RESULT_JSON } from '../components/terminal'

test('homepage terminal uses the complete stable search result shape', () => {
  expect(JSON.parse(SEARCH_RESULT_JSON)).toEqual({
    results: [
      {
        ref: 'ctx://01J00000000000000000000000/file/aurora.txt',
        profile: { id: 'file', version: 1 },
        sourceId: '01J00000000000000000000000',
        origin: 'local',
        originRank: 0,
        title: 'aurora.txt',
        summary: null,
        occurredAt: 1784109600000,
        chunks: [
          {
            index: 0,
            snippet: 'Project Aurora kickoff is Tuesday at 10:00.',
          },
        ],
      },
    ],
    pagination: { offset: 0, limit: 20, hasMore: false },
    warnings: [],
  })
})

test('homepage proves the local agent workflow before broad product claims', async () => {
  const page = await readFile(
    resolve(import.meta.dir, '(home)/page.tsx'),
    'utf8',
  )
  const terminal = await readFile(
    resolve(import.meta.dir, '../components/terminal.tsx'),
    'utf8',
  )
  const css = await readFile(resolve(import.meta.dir, 'global.css'), 'utf8')

  expect(page).toContain('any shell-capable agent')
  expect(page).toContain('mail,')
  expect(page).toContain('calendars, files, and Extension-defined context')
  expect(page).toContain('bun add --global ctxindex')
  expect(page).toContain('href="/docs/start"')
  expect(page).toContain('href="/docs/extend"')
  expect(page).not.toContain('const features')
  expect(page).not.toContain('<main')
  expect(terminal).toContain('ctxindex search')
  expect(terminal).toContain('--realm work --kind file --json')
  expect(terminal).toContain('ctx://01J00000000000000000000000/file/aurora.txt')
  expect(css).not.toContain('.ctx-hero-glow')
  expect(css).not.toContain('radial-gradient')
})

test('home and documentation shells expose one main landmark', async () => {
  const home = await readFile(
    resolve(import.meta.dir, '(home)/page.tsx'),
    'utf8',
  )
  const docsPage = await readFile(
    resolve(import.meta.dir, 'docs/[[...slug]]/page.tsx'),
    'utf8',
  )

  expect(home).not.toContain('<main')
  expect(docsPage).toContain('<DocsPage role="main"')
})
