import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const skillPath = join(repoRoot, '.agents/skills/repo-development/SKILL.md')
const bundledSkillPath = join(repoRoot, 'skills/getting-started.md')
const cliOverviewPath = join(repoRoot, 'skills/reference/cli-overview.md')
const cliMainPath = join(repoRoot, 'apps/cli/src/main.ts')
const requiredDiscoverySnippets = [
  'ctxindex --help',
  'ctxindex describe',
  'ctxindex describe <profile|adapter|action> <id> --json',
  'ctxindex extension list',
  'ctxindex skills list',
  'ctxindex skills get <name>',
] as const

interface CtxindexInvocation {
  readonly subcommand: string
  readonly line: string
}

async function readSkill(): Promise<string> {
  return readFile(skillPath, 'utf8')
}

async function readCliMain(): Promise<string> {
  return readFile(cliMainPath, 'utf8')
}

async function readBundledSkill(): Promise<string> {
  return readFile(bundledSkillPath, 'utf8')
}

function fencedCodeBlocks(markdown: string): string[] {
  const blocks: string[] = []
  const pattern = /```[^\n]*\n([\s\S]*?)```/g
  let match = pattern.exec(markdown)

  while (match !== null) {
    blocks.push(match[1] ?? '')
    match = pattern.exec(markdown)
  }

  return blocks
}

function inlineCodeSpans(markdown: string): string[] {
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, '')
  return [...withoutFences.matchAll(/`([^`\n]+)`/g)].map(
    (match) => match[1] ?? '',
  )
}

function fenceOpeningLines(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => /^(?: {0,3})(?:`{3,}|~{3,})/.test(line))
}

function staticCommandInventory(
  markdown: string,
  commands: ReadonlySet<string>,
): string[] {
  const lines = markdown.split('\n')
  const inventory = new Set<string>()
  const commandEntries: number[] = []

  for (const [index, line] of lines.entries()) {
    const bareLine = line
      .trim()
      .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '')
      .replace(/^`/, '')

    for (const command of commands) {
      const match = new RegExp(`^${command}(.*)$`).exec(bareLine)
      if (match === null) continue

      const remainder = match[1] ?? ''
      if (
        remainder === '' ||
        /^\s*[/|]/.test(remainder) ||
        /^\s{2,}\S/.test(remainder)
      ) {
        inventory.add(line)
      } else if (/^\s+\S/.test(remainder)) {
        commandEntries.push(index)
      }
      break
    }
  }

  for (let index = 1; index < commandEntries.length; index += 1) {
    const previous = commandEntries[index - 1]
    const current = commandEntries[index]
    if (previous === undefined || current !== previous + 1) continue
    inventory.add(lines[previous] ?? '')
    inventory.add(lines[current] ?? '')
  }

  return [...inventory]
}

function extractCtxindexInvocations(markdown: string): CtxindexInvocation[] {
  const invocations: CtxindexInvocation[] = []
  const ctxindexCommand =
    /(?:^|[\s;&|])(?:ctxindex|bun\s+(?:run\s+)?cli)(?:\s+([^\s;&|]+))?/g

  for (const block of fencedCodeBlocks(markdown)) {
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim().replace(/^\$\s*/, '')
      if (!line || line.startsWith('#')) continue

      let match = ctxindexCommand.exec(line)
      while (match !== null) {
        const subcommand = match[1]
        if (subcommand && !subcommand.startsWith('-')) {
          invocations.push({ subcommand, line })
        }
        match = ctxindexCommand.exec(line)
      }
    }
  }

  return invocations
}

function implementedCommands(mainSource: string): Set<string> {
  const match =
    /function createRootCommand\([\s\S]*?subCommands: \{([\s\S]*?)\n {4}\},\n {2}\}\)/.exec(
      mainSource,
    )
  expect(
    match,
    'main.ts should define per-invocation root citty subCommands',
  ).not.toBeNull()
  const subCommands = match?.[1] ?? ''
  return new Set(
    [...subCommands.matchAll(/^ {6}'?([a-z][a-z0-9-]*)'?:/gm)].map(
      (commandMatch) => commandMatch[1] as string,
    ),
  )
}

test('repo-development skill exists', async () => {
  const skill = await readSkill()

  expect(skill.trim().length).toBeGreaterThan(0)
  expect(skill.length).toBeGreaterThan(500)
  expect(skill).toContain('name: repo-development')
})

test('repo-development skill keeps the supported CLI walkthrough', async () => {
  const skill = await readSkill()
  for (const command of [
    'bun cli extension list',
    'bun cli describe',
    'bun cli init',
    'bun cli realm add',
    'bun cli source add',
    'bun cli sync',
    'bun cli search',
    'bun cli get',
    'bun cli thread <ref>',
    'bun cli artifact list',
    'bun cli artifact download',
    'bun cli export',
    'bun cli describe action',
    'bun cli action run',
    'bun cli skills list',
    'bun cli secrets status',
    'bun cli oauth-app add',
    'bun cli account add',
  ]) {
    expect(skill).toContain(command)
  }
})

test('documented commands match implemented commands', async () => {
  const [skill, mainSource] = await Promise.all([readSkill(), readCliMain()])
  const invocations = extractCtxindexInvocations(skill)
  const commands = implementedCommands(mainSource)

  expect(invocations.length).toBeGreaterThan(0)

  const missingFromCommands = invocations.filter(
    ({ subcommand }) => !commands.has(subcommand),
  )

  expect(missingFromCommands).toEqual([])
})

test('no stale commands', async () => {
  const [skill, mainSource] = await Promise.all([readSkill(), readCliMain()])
  const supported = implementedCommands(mainSource)
  const stale = extractCtxindexInvocations(skill).filter(
    ({ subcommand }) => !supported.has(subcommand),
  )

  expect(stale).toEqual([])
})

test('bundled skill is concise orientation to live discovery', async () => {
  const [orientation, mainSource] = await Promise.all([
    readBundledSkill(),
    readCliMain(),
  ])

  for (const discovery of requiredDiscoverySnippets) {
    expect(orientation).toContain(discovery)
  }

  expect(inlineCodeSpans(orientation)).toEqual(requiredDiscoverySnippets)
  expect(fenceOpeningLines(orientation)).toEqual([])
  expect(
    staticCommandInventory(orientation, implementedCommands(mainSource)),
  ).toEqual([])

  for (const command of implementedCommands(mainSource)) {
    if (['describe', 'extension', 'skills'].includes(command)) continue
    expect(orientation).not.toMatch(new RegExp(`ctxindex\\s+${command}\\b`))
  }

  expect(orientation).not.toMatch(
    /--from-env|oauth-app add|account add|source add|provider console|credential/i,
  )
  expect(await Bun.file(cliOverviewPath).exists()).toBe(false)
})

test('bundled orientation guard rejects static inventories and schemas', async () => {
  const mainSource = await readCliMain()
  const commands = implementedCommands(mainSource)

  expect(
    staticCommandInventory('init  initialize local state', commands),
  ).toEqual(['init  initialize local state'])
  expect(
    staticCommandInventory('realm / oauth-app / account / source', commands),
  ).toEqual(['realm / oauth-app / account / source'])
  expect(
    staticCommandInventory('- search helps an agent find context.', commands),
  ).toEqual([])
  expect(
    staticCommandInventory('init initialize\nrealm configure', commands),
  ).toEqual(['init initialize', 'realm configure'])
  expect(
    fencedCodeBlocks('```json\n{"title":{"type":"string"}}\n```'),
  ).not.toEqual([])
  expect(fencedCodeBlocks('```yaml\nsender:\n  type: string\n```')).not.toEqual(
    [],
  )
  expect(fenceOpeningLines('~~~json\n{"sender":"value"}\n~~~')).not.toEqual([])
  expect(fenceOpeningLines('```yaml\nsender:\n  type: string')).not.toEqual([])
  expect(inlineCodeSpans('`ctxindex init`')).not.toEqual(
    requiredDiscoverySnippets,
  )
})

test('OAuth guidance derives provider vocabulary from describe output', async () => {
  const skill = await readSkill()
  expect(skill).toContain('bun cli describe adapter <adapter-id>')
  expect(skill).toContain(
    'bun cli oauth-app add <provider> <app-label> --from-env',
  )
  expect(skill).toContain('bun cli account add <provider> --app <app-label>')
  expect(skill).toContain('bun cli account list --json')
  expect(skill).not.toMatch(
    /\bauth add\b|--client(?:-id|-secret)?\b|--auth-code|--refresh-token/,
  )
  expect(skill).not.toMatch(/CTXINDEX_(?:GOOGLE|MICROSOFT|GMAIL)_/)
})

test('remote mailbox guidance teaches exact booleans and resumable continuation', async () => {
  const skill = await readSkill()
  expect(skill).toContain('--field unread=true')
  expect(skill).toContain('--field unread=false')
  expect(skill).toContain('--continuation <pagination.continuation>')
  expect(skill).toContain('pagination.hasMore')
  expect(skill).toContain('`truncated` warning')
  expect(skill).toContain('`--offset` remains local pagination only')
})
