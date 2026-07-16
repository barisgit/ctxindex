#!/usr/bin/env bun
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

export const maxCommandLines = 80
const defaultCommandRoot = resolve(
  import.meta.dir,
  '../../apps/cli/src/commands',
)
const importFromPattern = /\sfrom\s["'][^"']+["']\s*$/
const importStartPattern = /^\s*import\s/
const sideEffectImportPattern = /^\s*import\s*["'][^"']+["']\s*$/

export interface ThinCommandViolation {
  readonly path: string
  readonly lineCount: number
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function countCommandLines(source: string): number {
  let count = 0
  let inImport = false

  for (const rawLine of source.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

    if (/^\s*$/.test(line)) continue

    if (inImport) {
      if (importFromPattern.test(line)) inImport = false
      continue
    }

    if (importStartPattern.test(line)) {
      if (
        !importFromPattern.test(line) &&
        !sideEffectImportPattern.test(line)
      ) {
        inImport = true
      }
      continue
    }

    count++
  }

  return count
}

export async function discoverProductionCommandFiles(
  root = defaultCommandRoot,
): Promise<string[]> {
  const files: string[] = []
  const glob = new Bun.Glob('*.ts')
  for await (const path of glob.scan({ cwd: root, absolute: false })) {
    if (path.endsWith('.test.ts')) continue
    files.push(resolve(root, path))
  }
  return files.sort()
}

export async function findThinCommandViolations(
  files: readonly string[],
): Promise<readonly ThinCommandViolation[]> {
  const violations: ThinCommandViolation[] = []
  for (const path of files) {
    if (!isFile(path)) {
      violations.push({ path, lineCount: -1 })
      continue
    }
    const lineCount = countCommandLines(await Bun.file(path).text())
    if (lineCount > maxCommandLines) violations.push({ path, lineCount })
  }
  return violations
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const files =
    args.length === 0 ? await discoverProductionCommandFiles() : args
  const violations = await findThinCommandViolations(files)

  for (const violation of violations) {
    if (violation.lineCount < 0) {
      console.error(`cli-thin-lines: ${violation.path} does not exist`)
    } else {
      console.error(
        `cli-thin-lines: ${violation.path} has ${violation.lineCount} non-blank non-import lines (max ${maxCommandLines})`,
      )
    }
  }
  if (violations.length > 0) return 1

  console.log(
    `cli-thin-lines: ${files.length} production command files within ${maxCommandLines} non-blank non-import lines`,
  )
  return 0
}

if (import.meta.main) process.exit(await main())
