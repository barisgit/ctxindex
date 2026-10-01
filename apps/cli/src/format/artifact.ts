import type {
  ArtifactDownloadResult,
  ArtifactListResult,
} from '@ctxindex/core/artifact'
import {
  compactJson,
  formatPrettyCollection,
  formatTsv,
  type OutputColumn,
  type OutputEnvironment,
} from './output'

const artifactColumns = [
  { key: 'ref', label: 'Ref' },
  { key: 'filename', label: 'Filename' },
  { key: 'mediaType', label: 'Media type' },
  { key: 'byteSize', label: 'Bytes', align: 'right' },
] satisfies readonly OutputColumn[]

function artifactRows(result: ArtifactListResult) {
  return result.artifacts.map((artifact) => ({ ...artifact }))
}

export function formatArtifactListJson(result: ArtifactListResult): string {
  return compactJson(result)
}

export function formatArtifactListText(result: ArtifactListResult): string {
  return formatTsv(artifactColumns, artifactRows(result))
}

export function formatArtifactListPretty(
  result: ArtifactListResult,
  environment?: Pick<OutputEnvironment, 'columns'>,
): string {
  return formatPrettyCollection(
    artifactColumns,
    artifactRows(result),
    environment,
  )
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
