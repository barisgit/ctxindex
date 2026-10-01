import type { Stats } from 'node:fs'
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import ignore from 'ignore'
import { compareCodePoints } from './order'
import { normalizeRelativePath } from './ref'

/** Built-in default ignore globs owned by SPEC §5. */
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
  readonly absolutePath: string
  readonly relativePath: string
  readonly mtime: number
  readonly size: number
}

export interface WalkerWarning {
  readonly code:
    | 'symlink_skipped'
    | 'stat_failed'
    | 'traversal_failed'
    | 'ignore_read_failed'
    | 'path_escape_skipped'
    | 'invalid_path_skipped'
  readonly message: string
  readonly path: string
}

export interface WalkResult {
  readonly entries: readonly WalkerEntry[]
  readonly warnings: readonly WalkerWarning[]
  readonly uncertainPrefixes: readonly string[]
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException('The operation was aborted', 'AbortError')
    )
  }
}

export async function walkDirectory(
  rootPath: string,
  extra?: {
    readonly include?: readonly string[]
    readonly exclude?: readonly string[]
    readonly signal?: AbortSignal
  },
): Promise<WalkResult> {
  checkCancelled(extra?.signal)
  let canonicalRoot: string
  try {
    canonicalRoot = await realpath(rootPath)
  } catch (error) {
    if (isMissing(error)) {
      throw new Error('local.directory root_path does not exist')
    }
    throw new Error('local.directory root_path could not be inspected')
  }
  let rootStat: Stats
  try {
    rootStat = await stat(canonicalRoot)
  } catch {
    throw new Error('local.directory root_path could not be inspected')
  }
  if (!rootStat.isDirectory()) {
    throw new Error('local.directory root_path must be a directory')
  }

  const matcher = ignore().add(BUILTIN_IGNORES)
  const warnings: WalkerWarning[] = []
  const uncertainPrefixes: string[] = []

  async function addIgnoreFile(
    name: '.gitignore' | '.ctxindexignore',
  ): Promise<void> {
    try {
      matcher.add(await readFile(join(canonicalRoot, name), 'utf8'))
    } catch (error) {
      if (!isMissing(error)) {
        warnings.push({
          code: 'ignore_read_failed',
          message: `Could not read ignore rules: ${name}`,
          path: name,
        })
        uncertainPrefixes.push('')
      }
    }
  }

  await addIgnoreFile('.gitignore')
  if (extra?.exclude) matcher.add([...extra.exclude])
  await addIgnoreFile('.ctxindexignore')
  const includeMatcher = extra?.include
    ? ignore().add([...extra.include])
    : null
  const entries: WalkerEntry[] = []

  function insideRoot(path: string): boolean {
    return path === canonicalRoot || path.startsWith(`${canonicalRoot}${sep}`)
  }

  async function visit(
    directory: string,
    relativeDirectory: string,
  ): Promise<void> {
    checkCancelled(extra?.signal)
    let names: string[]
    try {
      names = await readdir(directory)
    } catch {
      const path = relativeDirectory || '.'
      warnings.push({
        code: 'traversal_failed',
        message: `Could not traverse directory: ${path}`,
        path,
      })
      uncertainPrefixes.push(relativeDirectory)
      return
    }

    for (const name of names.sort(compareCodePoints)) {
      checkCancelled(extra?.signal)
      const candidatePath = relativeDirectory
        ? `${relativeDirectory}/${name}`
        : name
      if (name.includes('\\')) {
        warnings.push({
          code: 'invalid_path_skipped',
          message: 'Skipped non-POSIX filename',
          path: candidatePath,
        })
        continue
      }
      const relativePath = normalizeRelativePath(candidatePath)
      const absolutePath = join(directory, name)
      let metadata: Stats
      try {
        metadata = await lstat(absolutePath)
      } catch {
        warnings.push({
          code: 'stat_failed',
          message: `Could not inspect path: ${relativePath}`,
          path: relativePath,
        })
        uncertainPrefixes.push(relativePath)
        continue
      }

      if (metadata.isSymbolicLink()) {
        warnings.push({
          code: 'symlink_skipped',
          message: `Skipped symbolic link: ${relativePath}`,
          path: relativePath,
        })
        continue
      }
      if (!metadata.isDirectory() && !metadata.isFile()) continue

      if (
        metadata.isDirectory() &&
        (matcher.ignores(relativePath) || matcher.ignores(`${relativePath}/`))
      ) {
        continue
      }

      let canonicalPath: string
      try {
        canonicalPath = await realpath(absolutePath)
      } catch {
        warnings.push({
          code: 'stat_failed',
          message: `Could not inspect path: ${relativePath}`,
          path: relativePath,
        })
        uncertainPrefixes.push(relativePath)
        continue
      }
      if (!insideRoot(canonicalPath)) {
        warnings.push({
          code: 'path_escape_skipped',
          message: `Skipped path outside root: ${relativePath}`,
          path: relativePath,
        })
        continue
      }

      if (metadata.isDirectory()) {
        await visit(canonicalPath, relativePath)
        continue
      }
      if (
        relativePath === '.gitignore' ||
        relativePath === '.ctxindexignore' ||
        matcher.ignores(relativePath) ||
        (includeMatcher && !includeMatcher.ignores(relativePath))
      ) {
        continue
      }

      let current: Stats
      try {
        current = await stat(canonicalPath)
      } catch {
        warnings.push({
          code: 'stat_failed',
          message: `Could not inspect path: ${relativePath}`,
          path: relativePath,
        })
        uncertainPrefixes.push(relativePath)
        continue
      }
      if (!current.isFile()) continue
      entries.push({
        absolutePath: canonicalPath,
        relativePath,
        mtime: current.mtimeMs,
        size: current.size,
      })
    }
  }

  await visit(canonicalRoot, '')
  entries.sort((left, right) =>
    compareCodePoints(left.relativePath, right.relativePath),
  )
  warnings.sort(
    (left, right) =>
      compareCodePoints(left.path, right.path) ||
      compareCodePoints(left.code, right.code),
  )
  uncertainPrefixes.sort(compareCodePoints)
  return { entries, warnings, uncertainPrefixes }
}
