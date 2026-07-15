import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Logger } from '../logger'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createRealmService } from './service'

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

describe('realm service', () => {
  test('createRealm and listRealms round trip a realm', () => {
    const service = createRealmService({ db, logger })

    const created = service.createRealm({ slug: 'work' })
    const realms = service.listRealms()

    expect(created.realmId).toBe('work')
    expect(realms.map((realm) => realm.slug)).toContain('work')
    expect(realms.find((realm) => realm.slug === 'work')).toMatchObject({
      id: created.realmId,
      label: null,
    })
  })

  test('getRealmBySlug returns the matching row', () => {
    const service = createRealmService({ db, logger })
    const created = service.createRealm({
      slug: 'personal',
      displayName: 'Personal',
    })

    expect(service.getRealmBySlug('personal')).toMatchObject({
      id: created.realmId,
      slug: 'personal',
      label: 'Personal',
    })
    expect(service.getRealmBySlug('missing')).toBeNull()
  })

  test('duplicate slug throws duplicate_realm_slug validation error', () => {
    const service = createRealmService({ db, logger })
    service.createRealm({ slug: 'work' })

    expect(() => service.createRealm({ slug: 'work' })).toThrow(
      expect.objectContaining({ code: 'duplicate_realm_slug' }),
    )
  })
})
