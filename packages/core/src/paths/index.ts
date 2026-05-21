// Biome lint note: this is ctxindex's only legal resolver; no other module should hand-roll config/data/state/cache/log paths.
import { homedir } from 'node:os'
import { join } from 'node:path'

function resolveDir(
  ctxindexEnv: string,
  xdgEnv: string,
  xdgDefault: string,
): string {
  const explicit = process.env[ctxindexEnv]
  if (explicit) return explicit

  const xdg = process.env[xdgEnv]
  if (xdg) return join(xdg, 'ctxindex')

  return join(homedir(), xdgDefault, 'ctxindex')
}

export function configDir(): string {
  return resolveDir('CTXINDEX_CONFIG_HOME', 'XDG_CONFIG_HOME', '.config')
}

export function dataDir(): string {
  return resolveDir('CTXINDEX_DATA_HOME', 'XDG_DATA_HOME', '.local/share')
}

export function stateDir(): string {
  return resolveDir('CTXINDEX_STATE_HOME', 'XDG_STATE_HOME', '.local/state')
}

export function cacheDir(): string {
  return resolveDir('CTXINDEX_CACHE_HOME', 'XDG_CACHE_HOME', '.cache')
}

export function logDir(): string {
  return join(stateDir(), 'logs')
}
