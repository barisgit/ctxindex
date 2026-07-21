import { expect, test } from 'bun:test'

const stalePackageName = '@ctxindex/' + 'adapters'
const stalePackagePath = 'packages/' + 'adapters'
const excludedPrefixes = [
  'openspec/changes/archive/',
  'openspec/changes/rename-official-integration-package/',
]
const textExtensions = new Set([
  '.json',
  '.lock',
  '.md',
  '.mjs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])

test('current repository references use the official integration package name', async () => {
  const process = Bun.spawn(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard'],
    { stdout: 'pipe' },
  )
  const paths = (await new Response(process.stdout).text())
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter(
      (path) => !excludedPrefixes.some((prefix) => path.startsWith(prefix)),
    )
    .filter((path) => textExtensions.has(path.slice(path.lastIndexOf('.'))))

  expect(await process.exited).toBe(0)

  const staleReferences: string[] = []
  for (const path of paths) {
    const file = Bun.file(path)
    if (!(await file.exists())) continue
    const source = await file.text()
    if (source.includes(stalePackageName) || source.includes(stalePackagePath))
      staleReferences.push(path)
  }

  expect(staleReferences).toEqual([])
})
