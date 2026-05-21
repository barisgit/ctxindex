import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path'

export type SkillRecord = {
  name: string
  path: string
  summary: string
}

export type SkillDocument = SkillRecord & {
  content: string
}

function toPosixPath(path: string): string {
  return path.split(sep).join(posix.sep)
}

function skillNameFromPath(root: string, path: string): string {
  const relativePath = toPosixPath(relative(root, path))
  return relativePath.endsWith('.md') ? relativePath.slice(0, -3) : relativePath
}

function assertInsideRoot(root: string, path: string): void {
  const relativePath = relative(root, path)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(
      `Refusing to read skill outside bundled skills directory: ${path}`,
    )
  }
}

function resolveSkillPath(root: string, name: string): string {
  const normalizedName = toPosixPath(name)
  const markdownName = normalizedName.endsWith('.md')
    ? normalizedName
    : `${normalizedName}.md`
  const path = resolve(root, markdownName)

  assertInsideRoot(root, path)

  return path
}

function summarize(content: string): string {
  const lines = content.split(/\r?\n/)
  let index = 0

  while (index < lines.length && lines[index]?.trim() === '') {
    index += 1
  }

  if (lines[index]?.startsWith('# ')) {
    index += 1
  }

  while (index < lines.length) {
    const line = lines[index]?.trim()

    if (line) {
      return line
    }

    index += 1
  }

  return ''
}

async function readSkillRecord(
  root: string,
  path: string,
): Promise<SkillRecord> {
  const content = await readFile(path, 'utf8')

  return {
    name: skillNameFromPath(root, path),
    path,
    summary: summarize(content),
  }
}

export async function listSkills(root: string): Promise<SkillRecord[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => resolve(root, entry.name))
    .sort((a, b) =>
      skillNameFromPath(root, a).localeCompare(skillNameFromPath(root, b)),
    )

  return Promise.all(markdownFiles.map((path) => readSkillRecord(root, path)))
}

export async function getSkill(
  root: string,
  name: string,
): Promise<SkillDocument> {
  const path = resolveSkillPath(root, name)
  const fileStat = await stat(path).catch(() => null)

  if (!fileStat?.isFile()) {
    throw new Error(`Bundled skill not found: ${name}`)
  }

  const content = await readFile(path, 'utf8')
  const record = await readSkillRecord(root, path)

  return {
    ...record,
    content,
  }
}

async function inlineSkillFile(
  root: string,
  path: string,
  stack: string[],
): Promise<string> {
  assertInsideRoot(root, path)

  if (stack.includes(path)) {
    const cycle = [...stack, path]
      .map((cyclePath) => skillNameFromPath(root, cyclePath))
      .join(' -> ')
    throw new Error(`Cycle detected while inlining bundled skills: ${cycle}`)
  }

  const content = await readFile(path, 'utf8')
  const nextStack = [...stack, path]
  const linkPattern = /!?\[[^\]]*\]\(((?:\.\/|\.\.\/)[^)]+?\.md)\)/g
  let result = ''
  let lastIndex = 0

  for (const match of content.matchAll(linkPattern)) {
    const link = match[1]
    const matchIndex = match.index

    if (link === undefined || matchIndex === undefined) {
      continue
    }

    const linkedPath = resolve(dirname(path), link)
    assertInsideRoot(root, linkedPath)

    const linkedContent = await inlineSkillFile(root, linkedPath, nextStack)
    const linkedName = skillNameFromPath(root, linkedPath)

    result += content.slice(lastIndex, matchIndex)
    result += `\n\n--- inlined: ${linkedName} ---\n\n${linkedContent}`
    lastIndex = matchIndex + match[0].length
  }

  result += content.slice(lastIndex)

  return result
}

export async function getSkillContent(
  root: string,
  name: string,
  options: { inline?: boolean } = {},
): Promise<SkillDocument> {
  const skill = await getSkill(root, name)

  if (!options.inline) {
    return skill
  }

  return {
    ...skill,
    content: await inlineSkillFile(root, skill.path, []),
  }
}
