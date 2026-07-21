import { CtxindexValidationError } from '../errors'
import type {
  CreateRealmInput,
  CreateRealmResult,
  RealmRow,
  RealmService,
  RealmServiceDeps,
} from './types'

const REALM_SLUG_PATTERN = /^[a-z][a-z0-9_-]*$/i

export function assertValidRealmSlug(slug: string): void {
  if (!REALM_SLUG_PATTERN.test(slug)) {
    throw new CtxindexValidationError(
      'invalid_filter',
      'invalid realm slug: use letters, numbers, underscores, or dashes, starting with a letter',
    )
  }
}

export function createRealmService(deps: RealmServiceDeps): RealmService {
  return {
    createRealm(input: CreateRealmInput): CreateRealmResult {
      assertValidRealmSlug(input.slug)
      const existing = deps.db
        .prepare('SELECT id FROM realms WHERE slug = ?')
        .get(input.slug)
      if (existing) {
        throw new CtxindexValidationError(
          'duplicate_realm_slug',
          `realm already exists: "${input.slug}"`,
        )
      }

      const realmId = input.slug
      deps.db
        .prepare(
          'INSERT INTO realms (id, slug, label, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(realmId, input.slug, input.displayName ?? null, Date.now())
      deps.logger.debug({ realmId, slug: input.slug }, 'realm created')
      return { realmId }
    },

    listRealms(): RealmRow[] {
      return deps.db
        .prepare('SELECT id, slug, label, created_at FROM realms ORDER BY slug')
        .all() as RealmRow[]
    },

    getRealmBySlug(slug: string): RealmRow | null {
      return deps.db
        .prepare(
          'SELECT id, slug, label, created_at FROM realms WHERE slug = ?',
        )
        .get(slug) as RealmRow | null
    },

    findRealmBySlug(slug: string): RealmRow | null {
      return this.getRealmBySlug(slug)
    },

    deleteRealm(slug: string): void {
      deps.db.prepare('DELETE FROM realms WHERE slug = ?').run(slug)
      deps.logger.debug({ slug }, 'realm deleted')
    },
  }
}
