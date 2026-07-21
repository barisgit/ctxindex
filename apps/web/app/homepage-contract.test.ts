import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  DEMO_COMMANDS,
  DEMO_EXTENSION_ID,
  DEMO_EXTENSION_TARGET,
  DEMO_RESULT,
} from '../components/demo-quickstart'

test('homepage demo keeps commands and result in one replaceable component', () => {
  expect(DEMO_EXTENSION_TARGET).toBe('./examples/tenders-extension')
  expect(DEMO_EXTENSION_ID).toBe('enarocanje.proof')
  expect(DEMO_COMMANDS).toContain('git clone')
  expect(DEMO_COMMANDS).toContain('bun cli extension install local')
  expect(DEMO_COMMANDS).toContain('bun cli sync --source demo-tenders')
  expect(DEMO_COMMANDS).toContain('"bridge inspection" --realm demo --json')
  expect(DEMO_RESULT).toContain('ctx://<source-id>/tender/JN-002%2F2026')
  expect(DEMO_RESULT).toContain('Municipal bridge inspection')
})

test('homepage proves the local agent workflow before secondary paths', async () => {
  const page = await readFile(
    resolve(import.meta.dir, '(home)/page.tsx'),
    'utf8',
  )
  const demo = await readFile(
    resolve(import.meta.dir, '../components/demo-quickstart.tsx'),
    'utf8',
  )
  const video = await readFile(
    resolve(import.meta.dir, '../components/demo-video.tsx'),
    'utf8',
  )
  const css = await readFile(resolve(import.meta.dir, 'global.css'), 'utf8')

  expect(page).toContain('shell-capable agent can use them')
  expect(page).toContain('mail, calendars, files, and')
  expect(page).toContain('Try the no-auth demo')
  expect(page).toContain('ctx://…/file/aurora.txt')
  expect(page).toContain('Providers stay canonical')
  expect(page).toContain('trusted in-process code')
  expect(page).toContain('href="/docs/start/agent-usage"')
  expect(page).toContain('href="/docs/extend"')
  expect(page).not.toContain('after the first public release')
  expect(page).not.toContain('<main')
  expect(demo).toContain('CopyButton')
  expect(video).toContain('DEMO_VIDEO_SRC')
  expect(video).toContain('DEMO_VIDEO_CAPTIONS')
  expect(video).toContain('if (!DEMO_VIDEO_SRC || !DEMO_VIDEO_CAPTIONS)')
  expect(video).toContain('return null')
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
