import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultConfig } from '../config'
import { loadExtensions } from './loader'

const originalCwd = process.cwd()
const sandboxes: string[] = []

afterEach(async () => {
  process.chdir(originalCwd)
  await Promise.all(
    sandboxes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

test('a relative Extension path never resolves against the process working directory', async () => {
  // The sandbox lives inside the package so the fixture can resolve the SDK.
  const sandbox = await mkdtemp(join(import.meta.dir, '.path-identity-'))
  sandboxes.push(sandbox)
  const packageRoot = join(sandbox, 'extension')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({
      name: '@ctxindex/path-identity-fixture',
      ctxindex: { extensions: ['./entry.ts'] },
    }),
  )
  await writeFile(
    join(packageRoot, 'entry.ts'),
    `import { defineExtension } from '@ctxindex/extension-sdk'
export default defineExtension({ id: 'fixture.path-identity' })
`,
  )
  const config = { ...defaultConfig(), extensions: { paths: ['extension'] } }

  const results = []
  for (const cwd of [sandbox, '/']) {
    process.chdir(cwd)
    results.push(await loadExtensions({ config, builtins: {} }))
  }

  for (const result of results) {
    expect(result.registry.list()).toEqual([])
    expect(result.diagnostics).toEqual([
      {
        path: 'extension',
        message:
          'Extension path must be absolute; relative paths resolve against the configuration file',
      },
    ])
  }
})
