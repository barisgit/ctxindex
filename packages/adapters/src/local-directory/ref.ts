export function normalizeRelativePath(path: string): string {
  const segments = path.split('/')
  if (
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:\//.test(path) ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error('File path must be root-relative')
  }
  return path
}

export function localDirectoryRef(sourceId: string, path: string): string {
  const normalized = normalizeRelativePath(path)
  return `ctx://${sourceId.toUpperCase()}/file/${encodeURIComponent(normalized)}`
}
