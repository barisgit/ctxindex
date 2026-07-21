import { parseRef } from '@ctxindex/core'
import type {
  ArtifactPurgeResult,
  ArtifactService,
} from '@ctxindex/core/artifact'
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
  open: OpenArtifactDeps = openDeps,
): Promise<number> {
  if (input.kind !== 'purge') {
    try {
      parseRef(input.ref)
    } catch {
      console.error(`artifact ${input.kind}: invalid <ref>: ${input.ref}`)
      return 2
    }
  }
  const deps = await open()
  try {
    if (input.kind === 'list') {
      const result = await deps.artifactService.list(input.ref)
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
      const result = await deps.artifactService.purge()
      console.log(
        input.json
          ? formatPurgeArtifactsJson(result)
          : formatPurgeArtifactsText(result),
      )
      return 0
    }

    const result = await deps.artifactService.download(input.ref, {
      ...(input.outputPath === undefined
        ? {}
        : { outputPath: input.outputPath }),
      signal: new AbortController().signal,
    })
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
    await deps.close()
  }
}
