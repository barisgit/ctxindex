import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

const workspaceRoot = resolve(import.meta.dir, '../..')
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  '.worktrees',
  'dist',
  'node_modules',
])
const historicalPrefixes = [
  'docs/milestones/',
  'openspec/changes/archive/',
  'openspec/changes/rename-mail-message-profile/',
]
const currentFacingExtensions = new Set([
  '.json',
  '.md',
  '.mdx',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])
const staleVocabulary = [
  ['communication', 'message'].join('.'),
  ['communication', 'message'].join('-'),
  ['communication', 'Message'].join(''),
  ['Communication', 'Message'].join(''),
]

async function* currentFacingFiles(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const path = resolve(directory, entry.name)
    const workspacePath = relative(workspaceRoot, path).replaceAll('\\', '/')
    if (historicalPrefixes.some((prefix) => workspacePath.startsWith(prefix)))
      continue
    if (entry.isDirectory()) yield* currentFacingFiles(path)
    else if (entry.isFile() && currentFacingExtensions.has(extname(entry.name)))
      yield path
  }
}

test('current-facing surfaces contain no legacy broad message vocabulary', async () => {
  const staleReferences: string[] = []

  for await (const path of currentFacingFiles(workspaceRoot)) {
    const source = await readFile(path, 'utf8')
    for (const stale of staleVocabulary) {
      if (source.includes(stale))
        staleReferences.push(`${relative(workspaceRoot, path)}: ${stale}`)
    }
  }

  expect(staleReferences).toEqual([])
})
