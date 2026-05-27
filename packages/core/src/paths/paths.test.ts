import { afterEach, expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resetEnvForTests } from '../config/env-loader'
import { cacheDir, configDir, dataDir, logDir, stateDir } from '.'

const savedEnv = { ...process.env }

const pathEnvKeys = [
  'CTXINDEX_CONFIG_HOME',
  'CTXINDEX_DATA_HOME',
  'CTXINDEX_STATE_HOME',
  'CTXINDEX_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
] as const

afterEach(() => {
  process.env = { ...savedEnv }
  resetEnvForTests()
})

function clearPathEnv(): void {
  for (const key of pathEnvKeys) {
    delete process.env[key]
  }
  resetEnvForTests()
}

function setPathEnv(key: (typeof pathEnvKeys)[number], value: string): void {
  process.env[key] = value
}

test('CTXINDEX path env vars take precedence over XDG vars', () => {
  clearPathEnv()
  setPathEnv('CTXINDEX_CONFIG_HOME', '/ctx/config')
  setPathEnv('CTXINDEX_DATA_HOME', '/ctx/data')
  setPathEnv('CTXINDEX_STATE_HOME', '/ctx/state')
  setPathEnv('CTXINDEX_CACHE_HOME', '/ctx/cache')
  setPathEnv('XDG_CONFIG_HOME', '/xdg/config')
  setPathEnv('XDG_DATA_HOME', '/xdg/data')
  setPathEnv('XDG_STATE_HOME', '/xdg/state')
  setPathEnv('XDG_CACHE_HOME', '/xdg/cache')
  resetEnvForTests()

  expect(configDir()).toBe('/ctx/config')
  expect(dataDir()).toBe('/ctx/data')
  expect(stateDir()).toBe('/ctx/state')
  expect(cacheDir()).toBe('/ctx/cache')
  expect(logDir()).toBe(join('/ctx/state', 'logs'))
})

test('XDG path env vars are used when CTXINDEX vars are absent', () => {
  clearPathEnv()
  setPathEnv('XDG_CONFIG_HOME', '/xdg/config')
  setPathEnv('XDG_DATA_HOME', '/xdg/data')
  setPathEnv('XDG_STATE_HOME', '/xdg/state')
  setPathEnv('XDG_CACHE_HOME', '/xdg/cache')
  resetEnvForTests()

  expect(configDir()).toBe('/xdg/config/ctxindex')
  expect(dataDir()).toBe('/xdg/data/ctxindex')
  expect(stateDir()).toBe('/xdg/state/ctxindex')
  expect(cacheDir()).toBe('/xdg/cache/ctxindex')
  expect(logDir()).toBe('/xdg/state/ctxindex/logs')
})

test('home defaults are used when CTXINDEX and XDG vars are absent', () => {
  clearPathEnv()
  expect(configDir()).toBe(join(homedir(), '.config', 'ctxindex'))
  expect(dataDir()).toBe(join(homedir(), '.local/share', 'ctxindex'))
  expect(stateDir()).toBe(join(homedir(), '.local/state', 'ctxindex'))
  expect(cacheDir()).toBe(join(homedir(), '.cache', 'ctxindex'))
  expect(logDir()).toBe(join(homedir(), '.local/state', 'ctxindex', 'logs'))
})
