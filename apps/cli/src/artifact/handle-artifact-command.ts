import type { ArtifactService } from '@ctxindex/core/artifact'
import {
  artifactDownloadUsage,
  artifactListUsage,
  parseArtifactDownloadArgs,
  parseArtifactListArgs,
} from '../args/artifact'
import { openDeps } from '../deps'
import {
  formatArtifactDownloadJson,
  formatArtifactDownloadText,
  formatArtifactListJson,
  formatArtifactListText,
} from '../format/artifact'
import { mapErrorToExit } from '../format/exit'

type OpenArtifactDeps = () => Promise<{
  readonly artifactService: ArtifactService
  close(): Promise<void>
}>

export async function handleArtifactCommand(
  args: ['list' | 'download', ...string[]],
  open: OpenArtifactDeps = openDeps,
): Promise<number> {
  const [command, ...commandArgs] = args
  const parsed =
    command === 'list'
      ? parseArtifactListArgs(commandArgs)
      : parseArtifactDownloadArgs(commandArgs)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(
      `${parsed.message}. Try: ${command === 'list' ? artifactListUsage : artifactDownloadUsage}`,
    )
    return 2
  }
  const deps = await open()
  try {
    if (parsed.kind === 'list') {
      const result = await deps.artifactService.list(parsed.ref)
      console.log(
        parsed.json
          ? formatArtifactListJson(result)
          : formatArtifactListText(result),
      )
      if (!parsed.json) {
        for (const warning of result.warnings)
          console.error(`${warning.code}\t${warning.message}`)
      }
      return 0
    }

    const result = await deps.artifactService.download(parsed.ref, {
      ...(parsed.outputPath === undefined
        ? {}
        : { outputPath: parsed.outputPath }),
      signal: new AbortController().signal,
    })
    console.log(
      parsed.json
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
