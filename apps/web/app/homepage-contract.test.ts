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
  expect(DEMO_EXTENSION_TARGET).toContain('barisgit/ctxindex-extensions')
  expect(DEMO_EXTENSION_ID).toBe('barisgit.github-issues')
  expect(DEMO_COMMANDS).toContain('bun add --global ctxindex')
  expect(DEMO_COMMANDS).toContain('ctxindex extension install git')
  expect(DEMO_COMMANDS).toContain('ctxindex sync --source gh-issues')
  expect(DEMO_COMMANDS).toContain('issue --source gh-issues --local-only')
  expect(DEMO_RESULT).toContain('ctx://<source-id>/issue/84')
  expect(DEMO_RESULT).toContain('Ship the portable Agent Skill')
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
  const highlighter = await readFile(
    resolve(import.meta.dir, '../components/code-highlight.tsx'),
    'utf8',
  )
  const css = await readFile(resolve(import.meta.dir, 'global.css'), 'utf8')

  expect(page).toContain('All your context. One command')
  expect(page).toMatch(/grouped\s+into Realms, indexed on your machine/u)
  expect(page).toContain('Try the no-auth demo')
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
  expect(highlighter).toContain("from 'fumadocs-ui/components/codeblock.rsc'")
  expect(highlighter).toContain('ServerCodeBlock')
  expect(highlighter).not.toContain("from 'shiki'")
  expect(highlighter).not.toContain('dangerouslySetInnerHTML')
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
