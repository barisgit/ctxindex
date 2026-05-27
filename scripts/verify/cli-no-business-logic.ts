#!/usr/bin/env bun
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
process.chdir(repoRoot)

const sourceGlob = 'apps/cli/src/**/*.ts'
const forbiddenPatterns = [
  'db.prepare(',
  'db.exec(',
  ' INSERT ',
  ' UPDATE ',
  ' DELETE FROM ',
  ' SELECT ',
  'keychain:',
  'file:secrets.box',
  'URLSearchParams',
  'oauth2.googleapis.com',
  'gmail.googleapis.com',
  'accounts.google.com',
  'www.googleapis.com',
]

function normalizePath(path: string): string {
  return path.split(sep).join('/')
}

function isExcludedFile(path: string): boolean {
  return (
    path === 'apps/cli/src/main.ts' ||
    path.startsWith('apps/cli/src/args/') ||
    path.startsWith('apps/cli/src/format/') ||
    path === 'apps/cli/src/auth/google-loopback.ts' ||
    path.endsWith('.test.ts')
  )
}

async function sourceFiles(): Promise<string[]> {
  const glob = new Bun.Glob(sourceGlob)
  const paths: string[] = []
  for await (const path of glob.scan({ cwd: repoRoot, absolute: false })) {
    paths.push(normalizePath(path))
  }
  return paths.sort()
}

async function main(): Promise<number> {
  let found = false

  for (const file of await sourceFiles()) {
    if (isExcludedFile(file)) continue

    const source = await Bun.file(resolve(repoRoot, file)).text()
    const lines = source.split('\n')
    for (const pattern of forbiddenPatterns) {
      for (const [index, rawLine] of lines.entries()) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        if (!line.includes(pattern)) continue
        console.error(`${file}:${index + 1}: ${pattern}`)
        found = true
      }
    }
  }

  if (found) return 1

  console.log('cli-no-business-logic: no violations found')
  return 0
}

process.exit(await main())
