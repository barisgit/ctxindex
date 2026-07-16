import type {
  ArtifactDownloadResult,
  ArtifactListResult,
} from '@ctxindex/core/artifact'

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
