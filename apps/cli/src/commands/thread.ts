import type {
  ThreadNode,
  ThreadResult,
  ThreadService,
} from '@ctxindex/core/thread'
import { defineCommand } from 'citty'
import { parseThreadGetArgs, threadGetUsage } from '../args/thread-get'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

type OpenThreadDeps = () => Promise<{
  readonly threadService: ThreadService
  close(): Promise<void>
}>

export function formatThreadJson(result: ThreadResult): string {
  return JSON.stringify(result)
}

function formatNode(node: ThreadNode, depth: number, lines: string[]): void {
  lines.push(
    `${'  '.repeat(depth)}${node.resource.ref}${node.resource.title ? `\t${node.resource.title}` : ''}`,
  )
  for (const child of node.children) formatNode(child, depth + 1, lines)
}

export function formatThreadText(result: ThreadResult): string {
  const lines: string[] = []
  for (const message of result.messages) formatNode(message, 0, lines)
  return lines.join('\n')
}

export async function handleThreadGetCommand(
  args: string[],
  open: OpenThreadDeps = openDeps,
): Promise<number> {
  const parsed = parseThreadGetArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${threadGetUsage}`)
    return 2
  }

  const deps = await open()
  try {
    const result = deps.threadService.get(parsed.ref)
    console.log(
      parsed.json ? formatThreadJson(result) : formatThreadText(result),
    )
    if (!parsed.json) {
      for (const warning of result.warnings) {
        console.error(
          `${warning.code}\tUnavailable Profile ${warning.profileId}@${warning.profileVersion}`,
        )
      }
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps.close()
  }
}

export const threadGetCommand = defineCommand({
  meta: { name: 'get', description: 'Get a local related Resource thread.' },
  args: {
    ref: { type: 'positional', required: false, description: 'Resource Ref' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleThreadGetCommand(rawArgs)),
})

export const threadCommand = defineCommand({
  meta: { name: 'thread', description: 'Traverse local Resource Relations.' },
  subCommands: { get: threadGetCommand },
})
