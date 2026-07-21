import { parseRef } from '@ctxindex/core'
import type { ThreadService } from '@ctxindex/core/thread'
import { daemonThreadGet, selectDaemon } from '../daemon/client'
import { openDeps } from '../deps'
import { mapErrorToExit } from '../format/exit'
import type { OutputFormat } from '../format/output'
import {
  formatThreadJson,
  formatThreadPretty,
  formatThreadText,
} from '../format/thread'

type OpenThreadDeps = () => Promise<{
  readonly threadService: ThreadService
  close(): Promise<void>
}>

export interface ThreadCommandInput {
  readonly ref: string
  readonly format: OutputFormat
}

export async function handleThreadGetCommand(
  input: ThreadCommandInput,
  open: OpenThreadDeps = openDeps,
  daemon = { select: selectDaemon, get: daemonThreadGet },
): Promise<number> {
  try {
    parseRef(input.ref)
  } catch {
    console.error(`thread: invalid <ref>: ${input.ref}`)
    return 2
  }

  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: Awaited<ReturnType<OpenThreadDeps>> | undefined
  try {
    const selection = daemon.select()
    const result = selection
      ? await daemon.get(selection, input.ref, controller.signal)
      : await (async () => {
          deps = await open()
          return deps.threadService.get(input.ref)
        })()
    console.log(
      input.format === 'json'
        ? formatThreadJson(result)
        : input.format === 'pretty'
          ? formatThreadPretty(result)
          : formatThreadText(result),
    )
    if (input.format !== 'json') {
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
