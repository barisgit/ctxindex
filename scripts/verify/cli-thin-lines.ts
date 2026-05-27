#!/usr/bin/env bun
import { statSync } from 'node:fs'

const maxLines = 80
const importFromPattern = /\sfrom\s["'][^"']+["']\s*$/
const importStartPattern = /^\s*import\s/
const sideEffectImportPattern = /^\s*import\s*["'][^"']+["']\s*$/

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function countLines(source: string): number {
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

async function main(): Promise<number> {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error(
      `usage: ${process.argv[1] ?? process.argv[0]} <file> [file ...]`,
    )
    return 2
  }

  let status = 0
  for (const file of files) {
    if (!isFile(file)) {
      console.error(`cli-thin-lines: ${file} does not exist`)
      status = 1
      continue
    }

    const lineCount = countLines(await Bun.file(file).text())
    if (lineCount > maxLines) {
      console.error(
        `cli-thin-lines: ${file} has ${lineCount} non-blank non-import lines (max ${maxLines})`,
      )
      status = 1
    }
  }

  if (status !== 0) return status

  console.log(
    `cli-thin-lines: all files within ${maxLines} non-blank non-import lines`,
  )
  return 0
}

process.exit(await main())
