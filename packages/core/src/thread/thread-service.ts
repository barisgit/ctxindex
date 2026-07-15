import { CtxindexNotFoundError } from '../errors'
import { parseRef } from '../ref'
import type { ProfileRegistry, UnknownProfileWarning } from '../registry'
import { RelationStore } from '../relation'
import { ResourceStore, type StoredResource } from '../resource'
import type { CtxindexDatabase } from '../storage/db'

export const DEFAULT_THREAD_RELATION_NAMES = {
  conversation: 'conversation',
  parent: 'parent',
} as const

export interface ThreadRelationNames {
  readonly conversation: string
  readonly parent: string
}

export type ThreadResource = Omit<StoredResource, 'id'>

export interface ThreadNode {
  readonly resource: ThreadResource
  readonly children: readonly ThreadNode[]
}

export interface ThreadResult {
  readonly mode: 'tree' | 'flat'
  readonly messages: readonly ThreadNode[]
  readonly warnings: readonly UnknownProfileWarning[]
}

export interface CreateThreadServiceInput {
  readonly db: CtxindexDatabase
  readonly profiles: ProfileRegistry
  readonly relationNames?: ThreadRelationNames
}

export interface ThreadService {
  get(ref: string): ThreadResult
}

function compareResources(left: StoredResource, right: StoredResource): number {
  if (left.occurredAt === null && right.occurredAt !== null) return 1
  if (left.occurredAt !== null && right.occurredAt === null) return -1
  if (left.occurredAt !== right.occurredAt) {
    return (left.occurredAt as number) - (right.occurredAt as number)
  }
  return left.ref.localeCompare(right.ref)
}

function withoutInternalId(resource: StoredResource): ThreadResource {
  const { id: _id, ...visible } = resource
  return visible
}

function wouldCreateCycle(
  childId: string,
  parentId: string,
  assignments: ReadonlyMap<string, string>,
): boolean {
  let current: string | undefined = parentId
  const visited = new Set<string>()
  while (current !== undefined && !visited.has(current)) {
    if (current === childId) return true
    visited.add(current)
    current = assignments.get(current)
  }
  return false
}

export function createThreadService({
  db,
  profiles,
  relationNames = DEFAULT_THREAD_RELATION_NAMES,
}: CreateThreadServiceInput): ThreadService {
  const resources = new ResourceStore(db, profiles)
  const relations = new RelationStore(db)

  return {
    get(ref) {
      parseRef(ref)
      const seed = resources.get(ref)
      if (!seed) throw new CtxindexNotFoundError(`Resource not found: ${ref}`)

      const byId = new Map<string, StoredResource>([[seed.id, seed]])
      const pending = [seed.id]
      for (let index = 0; index < pending.length; index += 1) {
        const resourceId = pending[index] as string
        for (const relation of [
          relationNames.conversation,
          relationNames.parent,
        ]) {
          for (const match of relations.traverse(
            resourceId,
            relation,
            'both',
          )) {
            if (byId.has(match.resourceId)) continue
            const row = db
              .prepare(
                'SELECT ref FROM resources WHERE id = ? AND deleted_at IS NULL',
              )
              .get(match.resourceId) as { ref: string } | null
            if (!row) continue
            const resource = resources.get(row.ref)
            if (!resource) continue
            byId.set(match.resourceId, resource)
            pending.push(match.resourceId)
          }
        }
      }

      const assignments = new Map<string, string>()
      const childrenByParent = new Map<string, string[]>()
      const lexicalChildren = [...byId.values()].sort((left, right) =>
        left.ref.localeCompare(right.ref),
      )
      for (const child of lexicalChildren) {
        const candidateIds = new Set<string>()
        for (const edge of relations.list(child.id)) {
          if (edge.relation !== relationNames.parent) continue
          for (const candidateId of edge.resolvedResourceIds) {
            if (candidateId !== child.id && byId.has(candidateId)) {
              candidateIds.add(candidateId)
            }
          }
        }
        const candidates = [...candidateIds]
          .map((id) => byId.get(id) as StoredResource)
          .sort((left, right) => {
            const leftSameSource = left.sourceId === child.sourceId
            const rightSameSource = right.sourceId === child.sourceId
            if (leftSameSource !== rightSameSource)
              return leftSameSource ? -1 : 1
            return left.ref.localeCompare(right.ref)
          })
        const parent = candidates.find(
          (candidate) => !wouldCreateCycle(child.id, candidate.id, assignments),
        )
        if (!parent) continue
        assignments.set(child.id, parent.id)
        const children = childrenByParent.get(parent.id) ?? []
        children.push(child.id)
        childrenByParent.set(parent.id, children)
      }

      const toNode = (resourceId: string): ThreadNode => {
        const resource = byId.get(resourceId) as StoredResource
        const childIds = childrenByParent.get(resourceId) ?? []
        return {
          resource: withoutInternalId(resource),
          children: childIds
            .map((id) => byId.get(id) as StoredResource)
            .sort(compareResources)
            .map((child) => toNode(child.id)),
        }
      }
      const rootResources = [...byId.values()]
        .filter((resource) => !assignments.has(resource.id))
        .sort(compareResources)
      const warnings = new Map<string, UnknownProfileWarning>()
      for (const resource of byId.values()) {
        if (profiles.get(resource.profile)) continue
        const warning: UnknownProfileWarning = {
          code: 'unknown_profile_version',
          profileId: resource.profile.id,
          profileVersion: resource.profile.version,
        }
        warnings.set(`${warning.profileId}@${warning.profileVersion}`, warning)
      }

      const sortedWarnings = [...warnings.values()].sort(
        (left, right) =>
          left.profileId.localeCompare(right.profileId) ||
          left.profileVersion - right.profileVersion,
      )
      if (assignments.size === 0) {
        return {
          mode: 'flat',
          messages: rootResources.map((resource) => ({
            resource: withoutInternalId(resource),
            children: [],
          })),
          warnings: sortedWarnings,
        }
      }
      return {
        mode: 'tree',
        messages: rootResources.map((resource) => toNode(resource.id)),
        warnings: sortedWarnings,
      }
    },
  }
}
