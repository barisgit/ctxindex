import { isNormalizedRelativeFilePath } from '@ctxindex/profiles'

export function normalizeRelativePath(path: string): string {
  if (!isNormalizedRelativeFilePath(path)) {
    throw new Error('File path must be root-relative')
  }
  return path
}

export function localDirectoryRef(sourceId: string, path: string): string {
  const normalized = normalizeRelativePath(path)
  return `ctx://${sourceId.toUpperCase()}/file/${encodeURIComponent(normalized)}`
}
