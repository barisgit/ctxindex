#!/usr/bin/env bun
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

type ExportEntry = string | { import?: string; default?: string }
type CorePackageJson = { exports?: Record<string, ExportEntry> }

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
process.chdir(repoRoot)

const requiredSubpaths = ['auth', 'sync', 'realm', 'source', 'search', 'errors']
const packageJsonPath = 'packages/core/package.json'
const deepImportPattern = /from ['"]@ctxindex\/core\/src\//

function normalizePath(path: string): string {
  return path.split(sep).join('/')
}

function targetFor(entry: ExportEntry | undefined): string {
  if (typeof entry === 'string') return entry
  return entry?.import ?? entry?.default ?? ''
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

async function deepImportHits(): Promise<string[]> {
  const glob = new Bun.Glob('**/*')
  const roots = ['apps/cli/src', 'packages/official/src']
  const hits: string[] = []

  for (const root of roots) {
    const rootDir = resolve(repoRoot, root)
    for await (const entry of glob.scan({ cwd: rootDir, absolute: false })) {
      const path = normalizePath(`${root}/${entry}`)
      if (path.includes('/node_modules/')) continue
      if (!isFile(resolve(repoRoot, path))) continue

      const source = await Bun.file(resolve(repoRoot, path)).text()
      for (const [index, rawLine] of source.split('\n').entries()) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        if (!deepImportPattern.test(line)) continue
        hits.push(`${path}:${index + 1}:${line}`)
      }
    }
  }

  return hits.sort()
}

async function main(): Promise<number> {
  const pkg = (await Bun.file(
    resolve(repoRoot, packageJsonPath),
  ).json()) as CorePackageJson

  for (const subpath of requiredSubpaths) {
    const target = targetFor(pkg.exports?.[`./${subpath}`])
    if (target.length === 0 || target === 'undefined') {
      console.error(`exports['./${subpath}'] missing in ${packageJsonPath}`)
      return 1
    }

    const file = target.startsWith('./') ? target.slice(2) : target
    if (!existsSync(resolve(repoRoot, 'packages/core', file))) {
      console.error(
        `exports['./${subpath}'] -> ${file} does not exist (resolved: packages/core/${file})`,
      )
      return 1
    }
  }

  for (const subpath of requiredSubpaths) {
    try {
      await import(`@ctxindex/core/${subpath}`)
    } catch {
      console.error(`@ctxindex/core/${subpath} did not resolve at runtime`)
      return 1
    }
  }

  const deepHits = await deepImportHits()
  if (deepHits.length > 0) {
    console.error('deep imports into @ctxindex/core/src/** are banned:')
    console.error(deepHits.join('\n'))
    return 1
  }

  console.log(`exports-map: OK (subpaths=${requiredSubpaths.join(' ')})`)
  return 0
}

process.exit(await main())
