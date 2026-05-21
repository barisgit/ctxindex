import { afterEach, expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { cacheDir, configDir, dataDir, logDir, stateDir } from '.'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
})

function clearPathEnv(): void {
  for (const key of [
    'CTXINDEX_CONFIG_HOME',
    'CTXINDEX_DATA_HOME',
    'CTXINDEX_STATE_HOME',
    'CTXINDEX_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME',
    'XDG_CACHE_HOME',
  ]) {
    delete process.env[key]
  }
}

test('CTXINDEX path env vars take precedence over XDG vars', () => {
  clearPathEnv()
  process.env.CTXINDEX_CONFIG_HOME = '/ctx/config'
  process.env.CTXINDEX_DATA_HOME = '/ctx/data'
  process.env.CTXINDEX_STATE_HOME = '/ctx/state'
  process.env.CTXINDEX_CACHE_HOME = '/ctx/cache'
  process.env.XDG_CONFIG_HOME = '/xdg/config'
  process.env.XDG_DATA_HOME = '/xdg/data'
  process.env.XDG_STATE_HOME = '/xdg/state'
  process.env.XDG_CACHE_HOME = '/xdg/cache'

  expect(configDir()).toBe('/ctx/config')
  expect(dataDir()).toBe('/ctx/data')
  expect(stateDir()).toBe('/ctx/state')
  expect(cacheDir()).toBe('/ctx/cache')
  expect(logDir()).toBe(join('/ctx/state', 'logs'))
})

test('XDG path env vars are used when CTXINDEX vars are absent', () => {
  clearPathEnv()
  process.env.XDG_CONFIG_HOME = '/xdg/config'
  process.env.XDG_DATA_HOME = '/xdg/data'
  process.env.XDG_STATE_HOME = '/xdg/state'
  process.env.XDG_CACHE_HOME = '/xdg/cache'

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
