import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Violation = {
  path: string
  line: number
  column: number
  rule: string
  message: string
}

type ImportMatch = {
  specifier: string
  statement: string
  index: number
  specifierIndex: number
  dynamic: boolean
}

type StringLiteral = {
  content: string
  contentStart: number
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sourceGlob = 'apps/cli/src/**/*.ts'
const noqa = '// noqa: architecture-lint'
const rawSqlPattern =
  /^[\s\n]*(INSERT|UPDATE|DELETE|SELECT|CREATE|ALTER|DROP)\s+/i
const providerUrls = [
  'https://oauth2.googleapis.com',
  'https://gmail.googleapis.com',
  'https://accounts.google.com',
  'https://www.googleapis.com',
]

export async function lintFiles(paths: string[]): Promise<Violation[]> {
  const violations: Violation[] = []

  for (const path of paths) {
    const absolutePath = resolve(path)
    const source = await Bun.file(absolutePath).text()
    violations.push(...lintSource(absolutePath, source))
  }

  return violations
}

function lintSource(path: string, source: string): Violation[] {
  const violations: Violation[] = []
  const lineStarts = buildLineStarts(source)
  const relativePath = normalizePath(relative(repoRoot, path))

  for (const match of findImports(source)) {
    if (isSuppressed(source, lineStarts, match.specifierIndex)) continue
    if (!match.dynamic && isTypeOnlyImport(match.statement)) continue

    violations.push(...lintImport(relativePath, source, lineStarts, match))
  }

  for (const literal of findStringLiterals(source)) {
    const sqlMatch = rawSqlPattern.exec(literal.content)
    if (sqlMatch?.index !== undefined) {
      const index = literal.contentStart + sqlMatch.index
      if (
        !isAllowedRawSqlLiteral(relativePath) &&
        !isSuppressed(source, lineStarts, index)
      ) {
        violations.push(
          violation(
            relativePath,
            source,
            lineStarts,
            index,
            'raw-sql-literal',
            'raw SQL string literal is not allowed in apps/cli/src',
          ),
        )
      }
    }

    for (const url of providerUrls) {
      const urlIndex = literal.content.indexOf(url)
      if (urlIndex === -1) continue

      const index = literal.contentStart + urlIndex
      if (isSuppressed(source, lineStarts, index)) continue
      if (isAllowedProviderUrlLiteral(relativePath)) continue
      violations.push(
        violation(
          relativePath,
          source,
          lineStarts,
          index,
          'provider-url-literal',
          `provider URL literal is not allowed: ${url}`,
        ),
      )
    }
  }

  return violations
}

function lintImport(
  path: string,
  source: string,
  lineStarts: number[],
  match: ImportMatch,
): Violation[] {
  const violations: Violation[] = []
  const specifier = match.specifier

  if (specifier === 'bun:sqlite') {
    if (!isAllowedBunSqliteImport(path)) {
      violations.push(
        importViolation(
          path,
          source,
          lineStarts,
          match,
          'banned-import',
          'bun:sqlite imports are not allowed in apps/cli/src',
        ),
      )
    }
  }

  if (specifier === 'drizzle-orm' || specifier.startsWith('drizzle-orm/')) {
    violations.push(
      importViolation(
        path,
        source,
        lineStarts,
        match,
        'banned-import',
        'drizzle-orm imports are not allowed in apps/cli/src',
      ),
    )
  }

  if (
    specifier === '@ctxindex/core/src' ||
    specifier.startsWith('@ctxindex/core/src/')
  ) {
    violations.push(
      importViolation(
        path,
        source,
        lineStarts,
        match,
        'banned-import',
        '@ctxindex/core deep imports are not allowed; use public exports',
      ),
    )
  }

  if (isCommandFile(path) && !isAllowedCommandImport(specifier)) {
    violations.push(
      importViolation(
        path,
        source,
        lineStarts,
        match,
        'command-import-allowlist',
        `commands/ import is outside the architecture allowlist: ${specifier}`,
      ),
    )
  }

  return violations
}

function findImports(source: string): ImportMatch[] {
  const matches: ImportMatch[] = []
  const staticImportPattern = /import\s+[\s\S]*?\sfrom\s*(['"])([^'"]+)\1/g
  const sideEffectImportPattern = /import\s*(['"])([^'"]+)\1/g
  const dynamicImportPattern = /import\s*\(\s*(['"])([^'"]+)\1\s*\)/g

  for (const match of source.matchAll(staticImportPattern)) {
    const statement = match[0]
    const specifier = match[2]
    if (specifier === undefined || match.index === undefined) continue
    const specifierIndex = match.index + statement.lastIndexOf(specifier)
    matches.push({
      specifier,
      statement,
      index: match.index,
      specifierIndex,
      dynamic: false,
    })
  }

  for (const match of source.matchAll(sideEffectImportPattern)) {
    const statement = match[0]
    const specifier = match[2]
    if (specifier === undefined || match.index === undefined) continue
    const specifierIndex = match.index + statement.indexOf(specifier)
    matches.push({
      specifier,
      statement,
      index: match.index,
      specifierIndex,
      dynamic: false,
    })
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    const statement = match[0]
    const specifier = match[2]
    if (specifier === undefined || match.index === undefined) continue
    const specifierIndex = match.index + statement.indexOf(specifier)
    matches.push({
      specifier,
      statement,
      index: match.index,
      specifierIndex,
      dynamic: true,
    })
  }

  return matches.sort((left, right) => left.index - right.index)
}

function findStringLiterals(source: string): StringLiteral[] {
  const literals: StringLiteral[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '/' && next === '/') {
      index = source.indexOf('\n', index + 2)
      if (index === -1) break
      continue
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      continue
    }

    if (char !== "'" && char !== '"' && char !== '`') {
      index++
      continue
    }

    const quote = char
    const contentStart = index + 1
    index = contentStart
    while (index < source.length) {
      const current = source[index]
      if (current === '\\') {
        index += 2
        continue
      }
      if (current === quote) break
      index++
    }

    literals.push({ content: source.slice(contentStart, index), contentStart })
    index++
  }

  return literals
}

function isTypeOnlyImport(statement: string): boolean {
  if (/^\s*import\s+type\b/.test(statement)) return true

  const namedImport = /^\s*import\s*\{([\s\S]*?)\}\s*from\s*/.exec(statement)
  if (!namedImport) return false

  const specifiers = namedImport[1]
    ?.split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean)

  return (
    specifiers?.every((specifier) => specifier.startsWith('type ')) ?? false
  )
}

function isAllowedCommandImport(specifier: string): boolean {
  if (
    specifier === '@ctxindex/core' ||
    specifier.startsWith('@ctxindex/core/')
  ) {
    return true
  }
  if (
    specifier === '@ctxindex/adapters' ||
    specifier.startsWith('@ctxindex/adapters/')
  ) {
    return true
  }
  if (specifier === 'citty' || specifier === 'zod' || specifier === 'pino') {
    return true
  }
  if (specifier.startsWith('node:')) return true

  if (specifier.startsWith('../')) {
    return !isDirectStorageImport(specifier)
  }

  return false
}

function isAllowedRawSqlLiteral(path: string): boolean {
  return isCliSrcTestFile(path)
}

function isAllowedBunSqliteImport(path: string): boolean {
  return isCliSrcTestFile(path)
}

function isAllowedProviderUrlLiteral(path: string): boolean {
  return isCliSrcTestFile(path)
}

function isCliSrcTestFile(path: string): boolean {
  return path.startsWith('apps/cli/src/') && path.endsWith('.test.ts')
}

function isDirectStorageImport(specifier: string): boolean {
  return ['../db', '../schema', '../storage'].some(
    (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`),
  )
}

function isCommandFile(path: string): boolean {
  return (
    path.startsWith('apps/cli/src/commands/') &&
    path.endsWith('.ts') &&
    !isCliSrcTestFile(path)
  )
}

function importViolation(
  path: string,
  source: string,
  lineStarts: number[],
  match: ImportMatch,
  rule: string,
  message: string,
): Violation {
  return violation(
    path,
    source,
    lineStarts,
    match.specifierIndex,
    rule,
    message,
  )
}

function violation(
  path: string,
  source: string,
  lineStarts: number[],
  index: number,
  rule: string,
  message: string,
): Violation {
  const location = locationForIndex(source, lineStarts, index)
  return { path, line: location.line, column: location.column, rule, message }
}

function buildLineStarts(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') starts.push(index + 1)
  }
  return starts
}

function locationForIndex(
  source: string,
  lineStarts: number[],
  index: number,
): { line: number; column: number } {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const lineStart = lineStarts[mid]
    const nextLineStart = lineStarts[mid + 1] ?? source.length + 1
    if (lineStart === undefined) break
    if (index < lineStart) {
      high = mid - 1
    } else if (index >= nextLineStart) {
      low = mid + 1
    } else {
      return { line: mid + 1, column: index - lineStart + 1 }
    }
  }

  return { line: 1, column: index + 1 }
}

function isSuppressed(
  source: string,
  lineStarts: number[],
  index: number,
): boolean {
  const { line } = locationForIndex(source, lineStarts, index)
  const start = lineStarts[line - 1] ?? 0
  const end = source.indexOf('\n', start)
  const lineText = source.slice(start, end === -1 ? source.length : end)
  return lineText.includes(noqa)
}

function normalizePath(path: string): string {
  return path.split(sep).join('/')
}

async function sourceFiles(): Promise<string[]> {
  const glob = new Bun.Glob(sourceGlob)
  const paths: string[] = []
  for await (const path of glob.scan({ cwd: repoRoot, absolute: false })) {
    paths.push(resolve(repoRoot, path))
  }
  return paths.sort()
}

async function main(): Promise<void> {
  const violations = await lintFiles(await sourceFiles())

  for (const item of violations) {
    console.error(
      `${item.path}:${item.line}:${item.column}: ${item.rule}: ${item.message}`,
    )
  }

  if (violations.length > 0) {
    console.error(`architecture-lint: found ${violations.length} violation(s)`)
    process.exit(1)
  }

  console.log('architecture-lint: no violations found')
}

if (import.meta.main) {
  await main()
}
