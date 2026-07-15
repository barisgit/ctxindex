import type {
  ArtifactPurgeResult,
  ArtifactService,
} from '@ctxindex/core/artifact'
import { defineCommand } from 'citty'
import { parsePurgeArtifactsArgs, purgeArtifactsUsage } from '../args/purge'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

type OpenPurgeDeps = () => Promise<{
  readonly artifactService: ArtifactService
  close(): Promise<void>
}>

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

export async function handlePurgeArtifactsCommand(
  args: string[],
  open: OpenPurgeDeps = openDeps,
): Promise<number> {
  const parsed = parsePurgeArtifactsArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${purgeArtifactsUsage}`)
    return 2
  }
  const deps = await open()
  try {
    const result = await deps.artifactService.purge()
    console.log(
      parsed.json
        ? formatPurgeArtifactsJson(result)
        : formatPurgeArtifactsText(result),
    )
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps.close()
  }
}

export const purgeArtifactsCommand = defineCommand({
  meta: {
    name: 'artifacts',
    description: 'Remove all managed Artifact cache state.',
  },
  args: {
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handlePurgeArtifactsCommand(rawArgs)),
})

export const purgeCommand = defineCommand({
  meta: { name: 'purge', description: 'Purge explicit local cache state.' },
  subCommands: { artifacts: purgeArtifactsCommand },
})
