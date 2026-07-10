import { readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fdir } from 'fdir'
import ignore from 'ignore'

/** Built-in default ignore globs, verbatim from V1.md §1.3.1. */
const BUILTIN_IGNORES = [
  '.git/',
  'node_modules/',
  '.venv/',
  '.tox/',
  '__pycache__/',
  'dist/',
  'build/',
  'target/',
  '.next/',
  '.nuxt/',
  '.svelte-kit/',
  '.turbo/',
  '.cache/',
  '.parcel-cache/',
  '.DS_Store',
  'Thumbs.db',
  '*.lock',
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'pnpm-lock.yaml',
  'yarn.lock',
  'poetry.lock',
  'Cargo.lock',
  'uv.lock',
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

  // Per-source include globs use gitignore/glob semantics (SPEC §5), not a raw
  // substring match: a path is kept only if it matches an include pattern.
  const includeMatcher =
    extra?.include && extra.include.length > 0
      ? ignore().add(extra.include)
      : null

  const allFiles = await new fdir()
    .withFullPaths()
    .withErrors()
    .crawl(rootPath)
    .withPromise()

  const entries: WalkerEntry[] = []

  for (const absPath of allFiles as string[]) {
    const rel = relative(rootPath, absPath)
    if (ig.ignores(rel)) continue

    // include filter (glob semantics)
    if (includeMatcher && !includeMatcher.ignores(rel)) continue

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
