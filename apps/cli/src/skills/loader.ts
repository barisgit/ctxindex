import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, posix, relative, resolve, sep } from 'node:path'
import { compareStrings } from '@ctxindex/core/registry'

export type SkillRecord = {
  name: string
  path: string
  summary: string
}

export type SkillDocument = SkillRecord & {
  content: string
}

export type SkillsSource =
  | {
      readonly kind: 'filesystem'
      readonly root: string
      readonly location: string
    }
  | {
      readonly kind: 'embedded'
      readonly location: string
      readonly files: readonly EmbeddedSkillFile[]
    }

export interface EmbeddedSkillFile {
  readonly path: string
  readonly content: string
}

function toPosixPath(path: string): string {
  return path.split(sep).join(posix.sep)
}

function asSource(source: SkillsSource | string): SkillsSource {
  return typeof source === 'string'
    ? { kind: 'filesystem', root: source, location: source }
    : source
}

function skillNameFromRelativePath(path: string): string {
  return path.endsWith('.md') ? path.slice(0, -3) : path
}

function assertInsideRoot(root: string, path: string): void {
  const relativePath = relative(root, path)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(
      `Refusing to read skill outside bundled skills location: ${path}`,
    )
  }
}

function assertEmbeddedPath(path: string): void {
  if (path.startsWith('..') || posix.isAbsolute(path)) {
    throw new Error(
      `Refusing to read skill outside bundled skills location: ${path}`,
    )
  }
}

function resolveSkillRelativePath(name: string): string {
  const normalizedName = posix.normalize(toPosixPath(name))
  const markdownName = normalizedName.endsWith('.md')
    ? normalizedName
    : `${normalizedName}.md`
  assertEmbeddedPath(markdownName)
  return markdownName
}

function documentPath(source: SkillsSource, relativePath: string): string {
  return source.kind === 'filesystem'
    ? resolve(source.root, relativePath)
    : `${source.location}/${relativePath}`
}

function summarize(content: string): string {
  const lines = content.split(/\r?\n/)
  let index = 0

  while (index < lines.length && lines[index]?.trim() === '') index += 1
  if (lines[index]?.startsWith('# ')) index += 1

  while (index < lines.length) {
    const line = lines[index]?.trim()
    if (line) return line
    index += 1
  }

  return ''
}

async function filesystemMarkdownFiles(
  root: string,
  directory = root,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await filesystemMarkdownFiles(root, path)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(toPosixPath(relative(root, path)))
    }
  }

  return files
}

async function readContent(
  source: SkillsSource,
  relativePath: string,
): Promise<string | undefined> {
  if (source.kind === 'embedded') {
    return source.files.find((file) => file.path === relativePath)?.content
  }

  const path = resolve(source.root, relativePath)
  assertInsideRoot(source.root, path)
  return readFile(path, 'utf8').catch(() => undefined)
}

export async function listSkills(
  input: SkillsSource | string,
): Promise<SkillRecord[]> {
  const source = asSource(input)
  const markdownFiles = (
    source.kind === 'filesystem'
      ? await filesystemMarkdownFiles(source.root)
      : source.files.map((file) => file.path)
  )
    // Files under reference/ support inlining/get but are not top-level skills.
    .filter(
      (path) => !path.includes(posix.sep) && path.toLowerCase() !== 'readme.md',
    )
    .sort((a, b) =>
      compareStrings(
        skillNameFromRelativePath(a),
        skillNameFromRelativePath(b),
      ),
    )

  return Promise.all(
    markdownFiles.map(async (relativePath) => {
      const content = await readContent(source, relativePath)
      if (content === undefined) {
        throw new Error(`Bundled skill not found: ${relativePath}`)
      }
      return {
        name: skillNameFromRelativePath(relativePath),
        path: documentPath(source, relativePath),
        summary: summarize(content),
      }
    }),
  )
}

export async function getSkill(
  input: SkillsSource | string,
  name: string,
): Promise<SkillDocument> {
  const source = asSource(input)
  const relativePath = resolveSkillRelativePath(name)
  const content = await readContent(source, relativePath)

  if (content === undefined) {
    throw Object.assign(new Error(`Bundled skill not found: ${name}`), {
      exitCode: 2,
    })
  }

  return {
    name: skillNameFromRelativePath(relativePath),
    path: documentPath(source, relativePath),
    summary: summarize(content),
    content,
  }
}

async function inlineSkillFile(
  source: SkillsSource,
  relativePath: string,
  stack: string[],
): Promise<string> {
  assertEmbeddedPath(relativePath)

  if (stack.includes(relativePath)) {
    const cycle = [...stack, relativePath]
      .map(skillNameFromRelativePath)
      .join(' -> ')
    throw new Error(`Cycle detected while inlining bundled skills: ${cycle}`)
  }

  const content = await readContent(source, relativePath)
  if (content === undefined) {
    throw Object.assign(
      new Error(
        `Bundled skill not found: ${skillNameFromRelativePath(relativePath)}`,
      ),
      { exitCode: 2 },
    )
  }

  const nextStack = [...stack, relativePath]
  const linkPattern = /!?\[[^\]]*\]\(((?:\.\/|\.\.\/)[^)]+?\.md)\)/g
  let result = ''
  let lastIndex = 0

  for (const match of content.matchAll(linkPattern)) {
    const link = match[1]
    const matchIndex = match.index
    if (link === undefined || matchIndex === undefined) continue

    const linkedPath = posix.normalize(
      posix.join(posix.dirname(relativePath), link),
    )
    assertEmbeddedPath(linkedPath)
    const linkedContent = await inlineSkillFile(source, linkedPath, nextStack)
    const linkedName = skillNameFromRelativePath(linkedPath)

    result += content.slice(lastIndex, matchIndex)
    result += `\n\n--- inlined: ${linkedName} ---\n\n${linkedContent}`
    lastIndex = matchIndex + match[0].length
  }

  result += content.slice(lastIndex)
  return result
}

export async function getSkillContent(
  input: SkillsSource | string,
  name: string,
  options: { inline?: boolean } = {},
): Promise<SkillDocument> {
  const source = asSource(input)
  const skill = await getSkill(source, name)

  if (!options.inline) return skill

  return {
    ...skill,
    content: await inlineSkillFile(source, resolveSkillRelativePath(name), []),
  }
}
