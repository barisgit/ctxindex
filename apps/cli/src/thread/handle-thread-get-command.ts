import type {
  ThreadNode,
  ThreadResult,
  ThreadService,
} from '@ctxindex/core/thread'
import type { RpcThreadGetResult } from '@ctxindex/rpc'
import { parseThreadGetArgs, threadGetUsage } from '../args/thread-get'
import { daemonThreadGet, selectDaemon } from '../daemon/client'
import { openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'

type OpenThreadDeps = () => Promise<{
  readonly threadService: ThreadService
  close(): Promise<void>
}>

export function formatThreadJson(
  result: ThreadResult | RpcThreadGetResult,
): string {
  return JSON.stringify(result)
}

function formatNode(
  node: ThreadNode | RpcThreadGetResult['messages'][number],
  depth: number,
  lines: string[],
): void {
  lines.push(
    `${'  '.repeat(depth)}${node.resource.ref}${node.resource.title ? `\t${node.resource.title}` : ''}`,
  )
  for (const child of node.children) formatNode(child, depth + 1, lines)
}

export function formatThreadText(
  result: ThreadResult | RpcThreadGetResult,
): string {
  const lines: string[] = []
  for (const message of result.messages) formatNode(message, 0, lines)
  return lines.join('\n')
}

export async function handleThreadGetCommand(
  args: string[],
  open: OpenThreadDeps = openDeps,
  daemon = { select: selectDaemon, get: daemonThreadGet },
): Promise<number> {
  const parsed = parseThreadGetArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${threadGetUsage}`)
    return 2
  }

  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: Awaited<ReturnType<OpenThreadDeps>> | undefined
  try {
    const selection = daemon.select()
    const result = selection
      ? await daemon.get(selection, parsed.ref, controller.signal)
      : await (async () => {
          deps = await open()
          return deps.threadService.get(parsed.ref)
        })()
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
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}
