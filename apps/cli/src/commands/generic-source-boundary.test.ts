import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)

async function productionFiles(path: string): Promise<string[]> {
  const absolute = join(repoRoot, path)
  const entries = await readdir(absolute, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const relative = join(path, entry.name)
    if (entry.isDirectory()) files.push(...(await productionFiles(relative)))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
      files.push(relative)
  }
  return files
}

test('generic CLI/core search, get, and sync paths do not import local-directory internals', async () => {
  const files = [
    'apps/cli/src/commands/search.ts',
    'apps/cli/src/commands/get.ts',
    'apps/cli/src/commands/sync.ts',
    ...(await productionFiles('packages/core/src/search')),
    ...(await productionFiles('packages/core/src/source')),
    ...(await productionFiles('packages/core/src/sync')),
  ]
  for (const file of files) {
    const source = await readFile(join(repoRoot, file), 'utf8')
    expect(source, file).not.toMatch(/from ['"][^'"]*local-directory/)
    expect(source, file).not.toMatch(/from ['"]@ctxindex\/adapters/)
  }
})
