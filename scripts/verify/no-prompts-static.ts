#!/usr/bin/env bun
import { statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const targetRelative = 'apps/cli/src'
const targetDir = resolve(repoRoot, targetRelative)
const promptPattern =
  /from ['"](@inquirer\/[^'"]+|prompts|inquirer|enquirer)['"]|require\(['"](@inquirer\/[^'"]+|prompts|inquirer|enquirer)['"]\)|readline\.createInterface|node:readline|Bun\.stdin|process\.stdin\.(read|on)/

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
    path.endsWith('.test.ts') ||
    path.endsWith('.spec.ts') ||
    path === 'account/read-hidden-oauth-response.ts'
  )
}

async function promptMatches(): Promise<string[]> {
  const glob = new Bun.Glob('**/*.ts')
  const matches: string[] = []

  for await (const entry of glob.scan({ cwd: targetDir, absolute: false })) {
    const relativeEntry = normalizePath(entry)
    if (isExcluded(relativeEntry)) continue

    const absolutePath = resolve(targetDir, relativeEntry)
    if (!isFile(absolutePath)) continue

    const source = await Bun.file(absolutePath).text()
    for (const [index, rawLine] of source.split('\n').entries()) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (!promptPattern.test(line)) continue
      matches.push(`${absolutePath}:${index + 1}:${line}`)
    }
  }

  return matches.sort()
}

async function main(): Promise<number> {
  const matches = await promptMatches()
  if (matches.length > 0) {
    console.error(
      'Interactive prompt/static stdin usage found in apps/cli/src:',
    )
    console.error(matches.join('\n'))
    return 1
  }

  console.log('no unapproved interactive prompt imports or stdin reads found')
  return 0
}

process.exit(await main())
