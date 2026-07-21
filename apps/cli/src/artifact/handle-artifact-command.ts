import { parseRef } from '@ctxindex/core'
import type {
  ArtifactPurgeResult,
  ArtifactService,
} from '@ctxindex/core/artifact'
import { CtxindexError } from '@ctxindex/core/errors'
import {
  daemonArtifactDownload,
  daemonArtifactList,
  daemonArtifactPurge,
  daemonTransferToFile,
  selectDaemon,
} from '../daemon/client'
import {
  ensureDaemonSelection,
  resolveEnsuredDaemonSelection,
} from '../daemon/ensure'
import { openDeps } from '../deps'
import {
  formatArtifactDownloadJson,
  formatArtifactDownloadText,
  formatArtifactListJson,
  formatArtifactListPretty,
  formatArtifactListText,
} from '../format/artifact'
import { mapErrorToExit } from '../format/exit'
import type { OutputFormat } from '../format/output'

type OpenArtifactDeps = () => Promise<{
  readonly artifactService: ArtifactService
  close(): Promise<void>
}>

export interface ArtifactCommandDeps {
  readonly select: typeof selectDaemon
  readonly ensure?: typeof ensureDaemonSelection
  readonly list: typeof daemonArtifactList
  readonly download: typeof daemonArtifactDownload
  readonly transferToFile: typeof daemonTransferToFile
  readonly purge: typeof daemonArtifactPurge
  readonly open: OpenArtifactDeps
}

const defaultDeps: ArtifactCommandDeps = {
  select: selectDaemon,
  ensure: ensureDaemonSelection,
  list: daemonArtifactList,
  download: daemonArtifactDownload,
  transferToFile: daemonTransferToFile,
  purge: daemonArtifactPurge,
  open: openDeps,
}

export type ArtifactCommandInput =
  | {
      readonly kind: 'list'
      readonly ref: string
      readonly format: OutputFormat
    }
  | {
      readonly kind: 'download'
      readonly ref: string
      readonly outputPath?: string
      readonly json: boolean
    }
  | { readonly kind: 'purge'; readonly json: boolean }

export function formatPurgeArtifactsJson(result: ArtifactPurgeResult): string {
  return JSON.stringify(result)
}

export function formatPurgeArtifactsText(result: ArtifactPurgeResult): string {
  return [
    result.artifactCountRemoved,
    result.objectCountRemoved,
    result.logicalBytesFreed,
    result.physicalBytesFreed,
  ].join('\t')
}

export async function handleArtifactCommand(
  input: ArtifactCommandInput,
  services: ArtifactCommandDeps = defaultDeps,
): Promise<number> {
  if (input.kind !== 'purge') {
    try {
      parseRef(input.ref)
    } catch {
      console.error(`artifact ${input.kind}: invalid <ref>: ${input.ref}`)
      return 2
    }
  }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: Awaited<ReturnType<OpenArtifactDeps>> | undefined
  try {
    const selection = await resolveEnsuredDaemonSelection(
      services.ensure,
      services.select,
      controller.signal,
    )
    if (input.kind === 'list') {
      const result = selection
        ? await services.list(selection, input.ref, controller.signal)
        : await (async () => {
            deps = await services.open()
            return deps.artifactService.list(input.ref)
          })()
      console.log(
        input.format === 'json'
          ? formatArtifactListJson(result)
          : input.format === 'pretty'
            ? formatArtifactListPretty(result)
            : formatArtifactListText(result),
      )
      if (input.format !== 'json') {
        for (const warning of result.warnings)
          console.error(`${warning.code}\t${warning.message}`)
      }
      return 0
    }

    if (input.kind === 'purge') {
      const result = selection
        ? await services.purge(selection, controller.signal)
        : await (async () => {
            deps = await services.open()
            controller.signal.throwIfAborted()
            return deps.artifactService.purge()
          })()
      console.log(
        input.json
          ? formatPurgeArtifactsJson(result)
          : formatPurgeArtifactsText(result),
      )
      return 0
    }

    const result = selection
      ? await (async () => {
          const prepared = await services.download(
            selection,
            { ref: input.ref, transfer: input.outputPath !== undefined },
            controller.signal,
          )
          const { transfer, ...receipt } = prepared
          if (input.outputPath === undefined) return receipt
          if (!transfer)
            throw new CtxindexError(
              'The daemon did not prepare the Artifact byte transfer',
              'data_integrity',
            )
          await services.transferToFile(
            selection,
            transfer,
            input.outputPath,
            controller.signal,
          )
          return { ...receipt, outputPath: input.outputPath }
        })()
      : await (async () => {
          deps = await services.open()
          return deps.artifactService.download(input.ref, {
            ...(input.outputPath === undefined
              ? {}
              : { outputPath: input.outputPath }),
            signal: controller.signal,
          })
        })()
    console.log(
      input.json
        ? formatArtifactDownloadJson(result)
        : formatArtifactDownloadText(result),
    )
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}
