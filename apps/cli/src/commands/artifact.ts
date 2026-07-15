import type {
  ArtifactDownloadResult,
  ArtifactListResult,
  ArtifactService,
} from '@ctxindex/core/artifact'
import { defineCommand } from 'citty'
import {
  artifactDownloadUsage,
  artifactListUsage,
  parseArtifactDownloadArgs,
  parseArtifactListArgs,
} from '../args/artifact'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

type OpenArtifactDeps = () => Promise<{
  readonly artifactService: ArtifactService
  close(): Promise<void>
}>

export function formatArtifactListJson(result: ArtifactListResult): string {
  return JSON.stringify(result)
}

export function formatArtifactListText(result: ArtifactListResult): string {
  return result.artifacts
    .map((artifact) =>
      [
        artifact.ref,
        artifact.filename ?? '',
        artifact.mediaType ?? '',
        artifact.byteSize?.toString() ?? '',
      ].join('\t'),
    )
    .join('\n')
}

export function formatArtifactDownloadJson(
  result: ArtifactDownloadResult,
): string {
  return JSON.stringify(result)
}

export function formatArtifactDownloadText(
  result: ArtifactDownloadResult,
): string {
  return [result.artifact.ref, result.cache, result.outputPath ?? '']
    .filter((value, index) => index < 2 || value)
    .join('\t')
}

export async function handleArtifactListCommand(
  args: string[],
  open: OpenArtifactDeps = openDeps,
): Promise<number> {
  const parsed = parseArtifactListArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${artifactListUsage}`)
    return 2
  }
  const deps = await open()
  try {
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
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps.close()
  }
}

export async function handleArtifactDownloadCommand(
  args: string[],
  open: OpenArtifactDeps = openDeps,
): Promise<number> {
  const parsed = parseArtifactDownloadArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${artifactDownloadUsage}`)
    return 2
  }
  const deps = await open()
  try {
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

export const artifactListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List Artifact descriptors for a Resource.',
  },
  args: {
    ref: { type: 'positional', required: false, description: 'Resource Ref' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleArtifactListCommand(rawArgs)),
})

export const artifactDownloadCommand = defineCommand({
  meta: {
    name: 'download',
    description: 'Download an Artifact into the managed cache.',
  },
  args: {
    ref: { type: 'positional', required: false, description: 'Artifact Ref' },
    output: { type: 'string', description: 'Copy cached bytes to this path' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) =>
    runWithExit(() => handleArtifactDownloadCommand(rawArgs)),
})

export const artifactCommand = defineCommand({
  meta: {
    name: 'artifact',
    description: 'List and download managed Artifacts.',
  },
  subCommands: { list: artifactListCommand, download: artifactDownloadCommand },
})
