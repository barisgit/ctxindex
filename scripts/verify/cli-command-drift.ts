import { relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')
const commandPrefix = String.raw`(?:ctxindex|bun\s+(?:run\s+)?cli)`

const removedForms = [
  {
    label: 'plural Extension command',
    pattern: new RegExp(String.raw`\b${commandPrefix}\s+extensions\b`, 'g'),
  },
  {
    label: 'thread get command',
    pattern: new RegExp(String.raw`\b${commandPrefix}\s+thread\s+get\b`, 'g'),
  },
  {
    label: 'top-level purge command',
    pattern: new RegExp(String.raw`\b${commandPrefix}\s+purge\b`, 'g'),
  },
  {
    label: 'Action describe under action',
    pattern: new RegExp(
      String.raw`\b${commandPrefix}\s+action\s+describe\b`,
      'g',
    ),
  },
] as const

const inspectedExtensions = new Set(['.md', '.mdx', '.sh', '.ts', '.tsx'])

const excludedPrefixes = [
  'docs/design/',
  'docs/milestones/',
  'openspec/changes/',
]

function isInspected(path: string): boolean {
  if (excludedPrefixes.some((prefix) => path.startsWith(prefix))) return false
  if (/\.(?:e2e\.)?test\.[cm]?[jt]sx?$/.test(path)) return false

  const extension = path.slice(path.lastIndexOf('.'))
  return inspectedExtensions.has(extension)
}

const listed = Bun.spawnSync(
  ['git', 'ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
)

if (listed.exitCode !== 0) {
  throw new Error(new TextDecoder().decode(listed.stderr).trim())
}

const violations: string[] = []
const paths = new TextDecoder()
  .decode(listed.stdout)
  .split('\n')
  .filter(Boolean)
  .filter(isInspected)
  .sort((left, right) => left.localeCompare(right, 'en'))

for (const path of paths) {
  const file = Bun.file(resolve(repoRoot, path))
  if (!(await file.exists())) continue
  const content = await file.text()
  const lines = content.split('\n')

  for (const { label, pattern } of removedForms) {
    pattern.lastIndex = 0
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split('\n').length
      violations.push(
        `${relative(repoRoot, resolve(repoRoot, path))}:${line}: ${label}: ${lines[line - 1]?.trim()}`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error('Removed CLI command forms remain in current guidance:')
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log(`CLI command drift audit passed across ${paths.length} files.`)
