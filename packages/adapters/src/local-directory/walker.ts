import { readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fdir } from 'fdir'
import ignore from 'ignore'

/** Built-in ignore patterns per V1.md §1.3.1 */
const BUILTIN_IGNORES = [
  '.git',
  '.svn',
  '.hg',
  '.DS_Store',
  'Thumbs.db',
  'node_modules',
  '.pnp',
  '__pycache__',
  '*.pyc',
  '.venv',
  'venv',
  'env',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '.nyc_output',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env',
  '.env.*',
  '*.key',
  '*.pem',
  '*.p12',
  '*.pfx',
]

export interface WalkerEntry {
  absolutePath: string
  relativePath: string
  mtime: number
  size: number
}

export async function walkDirectory(
  rootPath: string,
  extra?: { include?: string[]; exclude?: string[] },
): Promise<WalkerEntry[]> {
  const ig = ignore()
  ig.add(BUILTIN_IGNORES)

  // Load .gitignore at root
  try {
    const gitignoreContent = await readFile(
      join(rootPath, '.gitignore'),
      'utf8',
    )
    ig.add(gitignoreContent)
  } catch {
    // No .gitignore — fine
  }

  // Load .ctxindexignore at root
  try {
    const ctxIgnoreContent = await readFile(
      join(rootPath, '.ctxindexignore'),
      'utf8',
    )
    ig.add(ctxIgnoreContent)
  } catch {
    // No .ctxindexignore — fine
  }

  if (extra?.exclude) ig.add(extra.exclude)

  const allFiles = await new fdir()
    .withFullPaths()
    .withErrors()
    .crawl(rootPath)
    .withPromise()

  const entries: WalkerEntry[] = []

  for (const absPath of allFiles as string[]) {
    const rel = relative(rootPath, absPath)
    if (ig.ignores(rel)) continue

    // include filter
    if (extra?.include && extra.include.length > 0) {
      const matchesInclude = extra.include.some((pattern) =>
        rel.includes(pattern),
      )
      if (!matchesInclude) continue
    }

    try {
      const st = await stat(absPath)
      if (!st.isFile()) continue
      entries.push({
        absolutePath: absPath,
        relativePath: rel,
        mtime: st.mtimeMs,
        size: st.size,
      })
    } catch {
      // stat failed — skip
    }
  }

  return entries
}
