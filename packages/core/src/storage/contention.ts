import { CtxindexError } from '../errors'

export const STORAGE_BUSY_MESSAGE =
  'Local storage remained unavailable for the configured wait; try again'

export function isStorageContention(error: unknown): boolean {
  if (error instanceof CtxindexError && error.code === 'storage_busy') {
    return true
  }
  if (typeof error !== 'object' || error === null) return false
  const { code, errno } = error as {
    readonly code?: unknown
    readonly errno?: unknown
  }
  return (
    (typeof code === 'string' &&
      (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED'))) ||
    errno === 5 ||
    errno === 6
  )
}

export function normalizeStorageError(error: unknown): never {
  if (error instanceof CtxindexError && error.code === 'storage_busy') {
    throw error
  }
  if (isStorageContention(error)) {
    throw new CtxindexError(STORAGE_BUSY_MESSAGE, 'storage_busy', {
      cause: error,
    })
  }
  throw error
}
