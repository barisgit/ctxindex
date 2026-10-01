/**
 * Bun test preload shared by the root and every workspace `bunfig.toml`.
 *
 * Each `bun test` process gets fresh temporary ctxindex config/data/state/cache
 * roots, so no test (and no CLI or daemon child that inherits `process.env`)
 * can resolve the developer's real default runtime under `$HOME`. Since
 * initialized registry reads ensure a daemon, an unisolated test would
 * otherwise start a real daemon against real user data.
 *
 * Assignment is unconditional: inherited shell values may point at real
 * state, and Turbo's strict env mode strips them anyway. Tests that need
 * specific roots still set them per test or per spawned child.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'ctxindex-test-state-'))

process.env.CTXINDEX_CONFIG_HOME = join(root, 'config')
process.env.CTXINDEX_DATA_HOME = join(root, 'data')
process.env.CTXINDEX_STATE_HOME = join(root, 'state')
process.env.CTXINDEX_CACHE_HOME = join(root, 'cache')

process.on('exit', () => rmSync(root, { recursive: true, force: true }))
