#!/usr/bin/env bun
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
process.chdir(repoRoot)

const auditPattern = /process\.env\.(CTXINDEX_|XDG_)/
const scanRoots = ['apps/cli', 'packages/core', 'packages/adapters', 'scripts']
const excludedEnvLoader = 'packages/core/src/config/env-loader.ts'
const tmpDir = 'packages/core/src/config/env-loader-verify-tmp'
const stub = `${tmpDir}/direct-read.ts`

function normalizePath(path: string): string {
  return path.split(sep).join('/')
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function isExcluded(path: string): boolean {
  return (
    path === excludedEnvLoader ||
    path.includes('/node_modules/') ||
    path.startsWith('node_modules/') ||
    path.includes('/migrations/') ||
    path.startsWith('migrations/')
  )
}

async function filesToScan(): Promise<string[]> {
  const glob = new Bun.Glob('**/*')
  const paths: string[] = []

  for (const root of scanRoots) {
    const rootDir = resolve(repoRoot, root)
    for await (const entry of glob.scan({ cwd: rootDir, absolute: false })) {
      const path = normalizePath(`${root}/${entry}`)
      if (isExcluded(path)) continue
      if (!isFile(resolve(repoRoot, path))) continue
      paths.push(path)
    }
  }

  return paths.sort()
}

async function checkDirectReads(): Promise<string[]> {
  const matches: string[] = []

  for (const path of await filesToScan()) {
    const source = await Bun.file(resolve(repoRoot, path)).text()
    for (const [index, rawLine] of source.split('\n').entries()) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (!auditPattern.test(line)) continue
      matches.push(`${path}:${index + 1}:${line}`)
    }
  }

  return matches
}

function printMatches(matches: string[]): void {
  if (matches.length === 0) return
  console.error(matches.join('\n'))
}

async function main(): Promise<number> {
  const matches = await checkDirectReads()
  if (matches.length > 0) {
    console.error(
      'VAL-ENV-LOADER FAIL: direct CTXINDEX_/XDG_ process.env reads found outside packages/core/src/config/env-loader.ts:',
    )
    printMatches(matches)
    return 1
  }

  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })

  try {
    await Bun.write(
      stub,
      [
        'export const synthetic = process.env.',
        'CTXINDEX_',
        'SYNTHETIC\n',
      ].join(''),
    )

    const syntheticMatches = await checkDirectReads()
    if (!syntheticMatches.some((match) => match.includes(stub))) {
      console.error(
        'VAL-ENV-LOADER FAIL: synthetic direct-read check was not caught by audit.',
      )
      printMatches(syntheticMatches)
      return 1
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  console.log(
    'VAL-ENV-LOADER: no direct CTXINDEX_/XDG_ process.env reads outside env-loader; synthetic check caught direct reads.',
  )
  return 0
}

process.exit(await main())
