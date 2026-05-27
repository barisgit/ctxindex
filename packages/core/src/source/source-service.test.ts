import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Logger } from '../logger'
import { createRealmService } from '../realm'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createSourceService } from './service'

let db: Database
const logger = { debug() {} } as unknown as Logger

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
})

afterEach(() => {
  db.close()
})

describe('source service', () => {
  test('addSource resolves a provided realm slug', () => {
    const realmService = createRealmService({ db, logger })
    const realm = realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService })

    const added = service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      configJson: '{"root":"/tmp"}',
    })

    expect(added.realmId).toBe(realm.realmId)
    expect(service.listSources({ realmSlug: 'work' })).toMatchObject([
      {
        id: added.sourceId,
        realm_id: realm.realmId,
        adapter_id: 'local.directory',
        config_json: '{"root":"/tmp"}',
      },
    ])
  })

  test('addSource falls back to the global realm slug', () => {
    const service = createSourceService({ db, logger })

    const added = service.addSource({ adapterId: 'local.directory' })

    expect(added.realmId).toBe('global')
    expect(service.findSourceById(added.sourceId)).toMatchObject({
      realm_id: 'global',
      adapter_id: 'local.directory',
    })
  })

  test('unknown realm slug throws unknown realm validation error', () => {
    const service = createSourceService({ db, logger })

    expect(() =>
      service.addSource({ adapterId: 'local.directory', realmSlug: 'missing' }),
    ).toThrow(expect.objectContaining({ code: 'unknown_realm' }))
  })
})
