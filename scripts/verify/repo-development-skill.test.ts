import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const skillPath = join(repoRoot, '.agents/skills/repo-development/SKILL.md')
const cliOverviewPath = join(repoRoot, 'skills/reference/cli-overview.md')
const cliMainPath = join(repoRoot, 'apps/cli/src/main.ts')

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

async function readCliOverview(): Promise<string> {
  return readFile(cliOverviewPath, 'utf8')
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
    /export const rootCommand = defineCommand\(\{[\s\S]*?subCommands: \{([\s\S]*?)\n {2}\},\n\}\)/.exec(
      mainSource,
    )
  expect(match, 'main.ts should define root citty subCommands').not.toBeNull()
  const subCommands = match?.[1] ?? ''
  return new Set(
    [...subCommands.matchAll(/^ {4}([a-z][a-z0-9-]*):/gm)].map(
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
    'bun cli extensions list',
    'bun cli describe',
    'bun cli init',
    'bun cli realm add',
    'bun cli source add',
    'bun cli sync',
    'bun cli search',
    'bun cli get',
    'bun cli thread get',
    'bun cli artifact list',
    'bun cli artifact download',
    'bun cli export',
    'bun cli action describe',
    'bun cli action run',
    'bun cli skills list',
    'bun cli secrets status',
    'bun cli client add',
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

test('bundled CLI overview inventories every root command', async () => {
  const [overview, mainSource] = await Promise.all([
    readCliOverview(),
    readCliMain(),
  ])
  const inventory = fencedCodeBlocks(overview).join('\n')
  for (const command of implementedCommands(mainSource)) {
    expect(inventory).toMatch(
      new RegExp(`(^|[\\s/])${command}(?=$|[\\s/])`, 'm'),
    )
  }
})

test('OAuth guidance derives provider vocabulary from describe output', async () => {
  const skill = await readSkill()
  expect(skill).toContain('bun cli describe adapter <adapter-id>')
  expect(skill).toContain('bun cli client add <provider> --from-env')
  expect(skill).toContain('bun cli account add <provider>')
  expect(skill).toContain('bun cli account list --json')
  expect(skill).not.toMatch(
    /\bauth add\b|--client-secret|--auth-code|--refresh-token/,
  )
  expect(skill).not.toMatch(/CTXINDEX_(?:GOOGLE|MICROSOFT|GMAIL)_/)
})
