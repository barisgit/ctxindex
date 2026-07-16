import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const docPath = join(repoRoot, 'docs/AGENT-HOWTOS.md')
const cliMainPath = join(repoRoot, 'apps/cli/src/main.ts')

interface CtxindexInvocation {
  readonly subcommand: string
  readonly line: string
}

async function readDoc(): Promise<string> {
  return readFile(docPath, 'utf8')
}

async function readCliMain(): Promise<string> {
  return readFile(cliMainPath, 'utf8')
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

test('agent-howtos doc exists', async () => {
  const doc = await readDoc()

  expect(doc.trim().length).toBeGreaterThan(0)
  expect(doc.length).toBeGreaterThan(500)
})

test('documented commands match implemented commands', async () => {
  const [doc, mainSource] = await Promise.all([readDoc(), readCliMain()])
  const invocations = extractCtxindexInvocations(doc)
  const commands = implementedCommands(mainSource)

  expect(invocations.length).toBeGreaterThan(0)

  const missingFromCommands = invocations.filter(
    ({ subcommand }) => !commands.has(subcommand),
  )

  expect(missingFromCommands).toEqual([])
})

test('no stale commands', async () => {
  const [doc, mainSource] = await Promise.all([readDoc(), readCliMain()])
  const supported = implementedCommands(mainSource)
  const stale = extractCtxindexInvocations(doc).filter(
    ({ subcommand }) => !supported.has(subcommand),
  )

  expect(stale).toEqual([])
})
