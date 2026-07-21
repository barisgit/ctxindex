import { Buffer } from 'node:buffer'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { extname, posix, relative, resolve, sep } from 'node:path'

const MAX_FILES = 128
const MAX_DEPTH = 8
const MAX_PATH_BYTES = 512
const MAX_MARKDOWN_BYTES = 512 * 1024
const MAX_ASSET_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 4 * 1024 * 1024
const MAX_REFERENCES = 4_096
const encoder = new TextEncoder()

export interface BundledDocumentationRoot {
  readonly root: string
  readonly logicalPrefix: string
  readonly exclude: readonly string[]
}

interface Candidate {
  readonly sourceRelativePath: string
  readonly logicalPath: string
  readonly kind: 'markdown' | 'asset'
  readonly mediaType: string
  readonly content: string | Uint8Array
  readonly title?: string
  readonly summary?: string
}

export interface EmbeddedDocumentationItem {
  readonly origin: { readonly kind: 'bundled' }
  readonly path: string
  readonly kind: 'markdown' | 'asset'
  readonly mediaType: string
  readonly byteSize: number
  readonly title?: string
  readonly summary?: string
  readonly contentBase64: string
}

function fail(message: string): never {
  throw new TypeError(`Invalid bundled documentation: ${message}`)
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) as number)
  const rightPoints = Array.from(
    right,
    (value) => value.codePointAt(0) as number,
  )
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index += 1
  ) {
    const difference =
      (leftPoints[index] as number) - (rightPoints[index] as number)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function validateLogicalPath(path: string): void {
  if (
    path.length === 0 ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    path !== path.normalize('NFC') ||
    posix.normalize(path) !== path ||
    encoder.encode(path).byteLength > MAX_PATH_BYTES ||
    path.split('/').length > MAX_DEPTH ||
    path
      .split('/')
      .some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail(`unsafe logical path ${path}`)
  }
}

function logicalPath(sourceRelativePath: string, prefix: string): string {
  const converted = sourceRelativePath.replace(/\.mdx?$/u, '.md')
  const named =
    posix.basename(converted) === 'index.md'
      ? posix.join(posix.dirname(converted), 'README.md')
      : converted
  return prefix.length === 0 ? named : posix.join(prefix, named)
}

function frontmatter(
  content: string,
  path: string,
): {
  readonly title?: string
  readonly summary?: string
} {
  if (!content.startsWith('---\n')) return {}
  const end = content.indexOf('\n---\n', 4)
  if (end < 0 || end > 16 * 1024) fail(`invalid frontmatter at ${path}`)
  let title: string | undefined
  let summary: string | undefined
  for (const line of content.slice(4, end).split('\n')) {
    if (line.trim().length === 0) continue
    const match = /^(title|description):\s*(.+)$/u.exec(line)
    if (match === null) fail(`unsupported frontmatter at ${path}`)
    const value = (match[2] as string).trim().replace(/^(['"])(.*)\1$/u, '$2')
    if (value.length === 0) fail(`empty frontmatter at ${path}`)
    if (match[1] === 'title') {
      if (title !== undefined) fail(`duplicate title at ${path}`)
      title = value
    } else {
      if (summary !== undefined) fail(`duplicate description at ${path}`)
      summary = value
    }
  }
  return {
    ...(title === undefined ? {} : { title }),
    ...(summary === undefined ? {} : { summary }),
  }
}

function dedent(value: string, spaces: number): string {
  const indentation = ' '.repeat(spaces)
  return value
    .split('\n')
    .map((line) => (line.startsWith(indentation) ? line.slice(spaces) : line))
    .join('\n')
    .trim()
}

function passiveMarkdown(content: string, path: string): string {
  let result = content.replace(
    /^import\s+.+from\s+['"]fumadocs-ui\/[^'"]+['"];?\s*$/gmu,
    '',
  )
  result = result.replace(/<Cards>\s*([\s\S]*?)\s*<\/Cards>/gu, (_, body) => {
    const cards: string[] = []
    for (const match of (body as string).matchAll(
      /<Card\s+([\s\S]*?)\s*\/>/gu,
    )) {
      const attributes = match[1] as string
      const title = /\btitle="([^"]+)"/u.exec(attributes)?.[1]
      const description = /\bdescription="([^"]+)"/u.exec(attributes)?.[1]
      const href = /\bhref="([^"]+)"/u.exec(attributes)?.[1]
      if (
        title === undefined ||
        description === undefined ||
        href === undefined
      )
        fail(`invalid Card presentation at ${path}`)
      cards.push(`- [${title}](${href}): ${description}`)
    }
    if (cards.length === 0) fail(`empty Cards presentation at ${path}`)
    return cards.join('\n')
  })
  let step = 0
  result = result.replace(
    /\s*<Step>\s*([\s\S]*?)\s*<\/Step>\s*/gu,
    (_, body) => {
      step += 1
      return `\n\n### Step ${step}\n\n${dedent(body as string, 4)}\n\n`
    },
  )
  result = result.replace(/<\/?Steps>\s*/gu, '')
  result = result.replace(
    /\s*<Tab\s+value="([^"]+)">\s*([\s\S]*?)\s*<\/Tab>\s*/gu,
    (_, label, body) =>
      `\n\n### ${label as string}\n\n${dedent(body as string, 4)}\n\n`,
  )
  result = result.replace(/<Tabs\s+items=\{[^>]+\}>\s*/gu, '')
  result = result.replace(/<\/Tabs>\s*/gu, '')
  result = result.replace(
    /\s*<Callout(?:\s+title="([^"]+)")?>\s*([\s\S]*?)\s*<\/Callout>\s*/gu,
    (_, title, body) => {
      const lines = dedent(body as string, 2)
        .split('\n')
        .map((line) => `> ${line}`)
      return `\n\n${
        title === undefined ? '' : `> **${title as string}**\n>\n`
      }${lines.join('\n')}\n\n`
    },
  )
  if (/^import\s+.+from\s+['"]fumadocs-/gmu.test(result))
    fail(`unsupported web runtime import at ${path}`)
  return `${result.replace(/\n{3,}/gu, '\n\n').trimEnd()}\n`
}

function assetMediaType(path: string, bytes: Uint8Array): string | undefined {
  const extension = extname(path).toLocaleLowerCase('und')
  if (
    extension === '.png' &&
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  )
    return 'image/png'
  if (
    (extension === '.jpg' || extension === '.jpeg') &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg'
  const header = new TextDecoder().decode(bytes.slice(0, 6))
  if (extension === '.gif' && (header === 'GIF87a' || header === 'GIF89a'))
    return 'image/gif'
  if (
    extension === '.webp' &&
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp'
  return undefined
}

function markdownDestinations(content: string): readonly string[] {
  const destinations: string[] = []
  const inline = /!?\[[^\]]*\]\(\s*([^\s)]+)(?:\s+[^)]*)?\)/gu
  for (const match of content.matchAll(inline))
    destinations.push(match[1] as string)
  const definitions = /^\s*\[[^\]]+\]:\s*([^\s]+).*$/gmu
  for (const match of content.matchAll(definitions))
    destinations.push(match[1] as string)
  return destinations
}

function rewriteReferences(candidates: readonly Candidate[]): Candidate[] {
  const logicalBySource = new Map(
    candidates.map((candidate) => [
      candidate.sourceRelativePath,
      candidate.logicalPath,
    ]),
  )

  function rewrite(destination: string, candidate: Candidate): string {
    const fragmentIndex = destination.indexOf('#')
    const path =
      fragmentIndex < 0 ? destination : destination.slice(0, fragmentIndex)
    const fragment = fragmentIndex < 0 ? '' : destination.slice(fragmentIndex)
    if (
      path.length === 0 ||
      path.startsWith('/docs/') ||
      /^https:\/\//iu.test(path) ||
      path.startsWith('/') ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(path)
    )
      return destination
    const sourceTarget = posix.normalize(
      posix.join(posix.dirname(candidate.sourceRelativePath), path),
    )
    const logicalTarget = logicalBySource.get(sourceTarget)
    if (logicalTarget === undefined) return destination
    const relativeTarget = posix.relative(
      posix.dirname(candidate.logicalPath),
      logicalTarget,
    )
    return `${relativeTarget.length === 0 ? posix.basename(logicalTarget) : relativeTarget}${fragment}`
  }

  return candidates.map((candidate) => {
    if (candidate.kind !== 'markdown') return candidate
    let content = (candidate.content as string).replace(
      /(!?\[[^\]]*\]\(\s*)([^\s)]+)((?:\s+[^)]*)?\))/gu,
      (_, prefix, destination, suffix) =>
        `${prefix as string}${rewrite(destination as string, candidate)}${suffix as string}`,
    )
    content = content.replace(
      /^(\s*\[[^\]]+\]:\s*)([^\s]+)(.*)$/gmu,
      (_, prefix, destination, suffix) =>
        `${prefix as string}${rewrite(destination as string, candidate)}${suffix as string}`,
    )
    return { ...candidate, content }
  })
}

function validateReferences(candidates: readonly Candidate[]): void {
  const logicalPaths = new Set(candidates.map(({ logicalPath }) => logicalPath))
  let referenceCount = 0
  for (const candidate of candidates) {
    if (candidate.kind !== 'markdown') continue
    for (const rawDestination of markdownDestinations(
      candidate.content as string,
    )) {
      referenceCount += 1
      if (referenceCount > MAX_REFERENCES) fail('too many references')
      const destination = rawDestination.split('#', 1)[0] as string
      if (
        destination.length === 0 ||
        destination.startsWith('#') ||
        destination.startsWith('/docs/') ||
        /^https:\/\//iu.test(destination)
      )
        continue
      if (
        destination.startsWith('/') ||
        destination.startsWith('//') ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(destination) ||
        destination.includes('\\') ||
        destination.includes('\0') ||
        destination.includes('%') ||
        destination.includes('?')
      )
        fail(`unsafe reference in ${candidate.logicalPath}`)
      const target = posix.normalize(
        posix.join(posix.dirname(candidate.logicalPath), destination),
      )
      if (
        target === '..' ||
        target.startsWith('../') ||
        !logicalPaths.has(target)
      )
        throw new TypeError(
          `Broken bundled documentation reference in ${candidate.logicalPath}: ${rawDestination}`,
        )
    }
  }
}

function defaultRoots(): readonly BundledDocumentationRoot[] {
  return [
    {
      root: resolve(import.meta.dir, '../../../../apps/web/content/docs'),
      logicalPrefix: '',
      exclude: ['cli', 'meta.json', 'concepts/meta.json', 'guides/meta.json'],
    },
  ]
}

export function buildBundledDocumentationManifest(
  roots: readonly BundledDocumentationRoot[] = defaultRoots(),
): EmbeddedDocumentationItem[] {
  const candidates: Candidate[] = []
  for (const configured of roots) {
    const root = realpathSync(configured.root)
    const exclusions = configured.exclude.map((entry) =>
      entry.replaceAll('\\', '/'),
    )
    function walk(directory: string): void {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
        (left, right) => compareCodePoints(left.name, right.name),
      )) {
        const path = resolve(directory, entry.name)
        const sourceRelativePath = relative(root, path).split(sep).join('/')
        if (
          exclusions.some(
            (excluded) =>
              sourceRelativePath === excluded ||
              sourceRelativePath.startsWith(`${excluded}/`),
          )
        )
          continue
        if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink())
          fail(`symbolic link at ${sourceRelativePath}`)
        if (entry.isDirectory()) {
          walk(path)
          continue
        }
        if (!entry.isFile()) fail(`unsupported entry at ${sourceRelativePath}`)
        const targetPath = logicalPath(
          sourceRelativePath,
          configured.logicalPrefix,
        )
        validateLogicalPath(targetPath)
        const bytes = new Uint8Array(readFileSync(path))
        if (/\.mdx?$/iu.test(sourceRelativePath)) {
          if (bytes.byteLength > MAX_MARKDOWN_BYTES)
            fail(`Markdown byte bound exceeded at ${targetPath}`)
          let content: string
          try {
            content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          } catch {
            fail(`invalid UTF-8 at ${targetPath}`)
          }
          candidates.push({
            sourceRelativePath,
            logicalPath: targetPath,
            kind: 'markdown',
            mediaType: 'text/markdown',
            content: passiveMarkdown(content, targetPath),
            ...frontmatter(content, targetPath),
          })
          continue
        }
        if (bytes.byteLength > MAX_ASSET_BYTES)
          fail(`asset byte bound exceeded at ${targetPath}`)
        const mediaType = assetMediaType(sourceRelativePath, bytes)
        if (mediaType === undefined) fail(`unsupported asset at ${targetPath}`)
        candidates.push({
          sourceRelativePath,
          logicalPath: targetPath,
          kind: 'asset',
          mediaType,
          content: bytes,
        })
      }
    }
    walk(root)
  }

  if (candidates.length === 0 || candidates.length > MAX_FILES)
    fail('file count bound exceeded')
  const ordered = rewriteReferences(
    candidates.sort((left, right) =>
      compareCodePoints(left.logicalPath, right.logicalPath),
    ),
  )
  const exact = new Set<string>()
  const folded = new Set<string>()
  let totalBytes = 0
  for (const candidate of ordered) {
    if (exact.has(candidate.logicalPath))
      fail(`duplicate path ${candidate.logicalPath}`)
    exact.add(candidate.logicalPath)
    const foldedPath = candidate.logicalPath.toLocaleLowerCase('und')
    if (folded.has(foldedPath))
      fail(`case-fold collision ${candidate.logicalPath}`)
    folded.add(foldedPath)
    totalBytes +=
      typeof candidate.content === 'string'
        ? encoder.encode(candidate.content).byteLength
        : candidate.content.byteLength
    if (totalBytes > MAX_TOTAL_BYTES) fail('total byte bound exceeded')
  }
  validateReferences(ordered)
  return ordered.map((candidate) => ({
    origin: { kind: 'bundled' as const },
    path: candidate.logicalPath,
    kind: candidate.kind,
    mediaType: candidate.mediaType,
    byteSize:
      typeof candidate.content === 'string'
        ? encoder.encode(candidate.content).byteLength
        : candidate.content.byteLength,
    ...(candidate.title === undefined ? {} : { title: candidate.title }),
    ...(candidate.summary === undefined ? {} : { summary: candidate.summary }),
    contentBase64: Buffer.from(
      typeof candidate.content === 'string'
        ? encoder.encode(candidate.content)
        : candidate.content,
    ).toString('base64'),
  }))
}
