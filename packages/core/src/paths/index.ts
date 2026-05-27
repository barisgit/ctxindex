// Biome lint note: this is ctxindex's only legal resolver; no other module should hand-roll config/data/state/cache/log paths.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type EnvSchemaKey, getEnv } from '../config/env-loader'

type CtxindexPathEnvKey = Extract<
  EnvSchemaKey,
  | 'CTXINDEX_CONFIG_HOME'
  | 'CTXINDEX_DATA_HOME'
  | 'CTXINDEX_STATE_HOME'
  | 'CTXINDEX_CACHE_HOME'
>

type XdgPathEnvKey = Extract<
  EnvSchemaKey,
  'XDG_CONFIG_HOME' | 'XDG_DATA_HOME' | 'XDG_STATE_HOME' | 'XDG_CACHE_HOME'
>

function resolveDir(
  ctxindexEnv: CtxindexPathEnvKey,
  xdgEnv: XdgPathEnvKey,
  xdgDefault: string,
): string {
  const env = getEnv()
  const explicit = env[ctxindexEnv]
  if (explicit) return explicit

  const xdg = env[xdgEnv]
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
