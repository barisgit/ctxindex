import { isAbsolute, posix } from 'node:path'
import { z } from 'zod'

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/)
const catalogEntryIndexSchema = z.number().int().nonnegative().max(255)
const extensionIdSchema = z
  .string()
  .max(128)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
const packageNameSchema = z
  .string()
  .regex(
    /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i,
  )

function credentialFree(value: string): boolean {
  const scpUser = /^([^/@\s]+)@[^/\s]+:/.exec(value)?.[1]
  if (scpUser !== undefined) return scpUser === 'git'
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true
  try {
    const parsed = new URL(value.replace(/^git\+/, ''))
    if (parsed.protocol === 'ssh:') {
      return (
        parsed.password.length === 0 &&
        (parsed.username.length === 0 || parsed.username === 'git')
      )
    }
    return parsed.username.length === 0 && parsed.password.length === 0
  } catch {
    return true
  }
}

const requestedTargetSchema = z
  .string()
  .min(1)
  .refine(credentialFree, 'Extension target must not contain credentials')
const repositoryIdentitySchema = requestedTargetSchema.refine(
  (value) => !value.includes('#') && !value.includes('?'),
  'Git repository identity must not contain a ref or query',
)

const relativePackageRootSchema = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    if (
      isAbsolute(value) ||
      value.includes('\\') ||
      value.includes('\0') ||
      value
        .split('/')
        .some((part) => part === '' || part === '.' || part === '..') ||
      posix.normalize(value) !== value
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Package root must be a contained relative path',
      })
    }
  })

export const directExtensionSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('npm'),
      requested_target: requestedTargetSchema,
      package: packageNameSchema,
      exact_version: z.string().min(1),
      integrity: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('git'),
      requested_target: requestedTargetSchema,
      repository: repositoryIdentitySchema,
      commit: z.string().regex(/^[0-9a-f]{40,64}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('local'),
      requested_target: requestedTargetSchema,
      origin_path: z.string().refine(isAbsolute).optional(),
      content_digest: digestSchema,
    })
    .strict(),
])

export const dependencyResolutionArtifactReferenceSchema = z
  .object({
    format: z.literal('bun.lock@1.3.14'),
    digest: digestSchema,
  })
  .strict()

export const catalogSourceLocatorSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('package'),
      entryIndex: catalogEntryIndexSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('literal'),
      module: relativePackageRootSchema,
      catalogId: extensionIdSchema,
      entryIndex: catalogEntryIndexSchema,
      extensionId: extensionIdSchema,
    })
    .strict(),
])

export type CatalogSourceLocator = z.infer<typeof catalogSourceLocatorSchema>

export const catalogCurationLinkSchema = z
  .object({
    extension_id: extensionIdSchema,
    catalog_name: z.string().min(1),
    catalog_id: z.string().min(1),
    repository: z.string().min(1),
    commit: z.string().regex(/^[0-9a-f]{40,64}$/),
    snapshot_acquired_at: z.number().int().nonnegative(),
    source_locator: catalogSourceLocatorSchema,
    execution_materialization_digest: digestSchema,
  })
  .strict()

export type CatalogCurationLink = z.infer<typeof catalogCurationLinkSchema>

export const directExtensionInstallationRecordSchema = z
  .object({
    id: extensionIdSchema,
    source: directExtensionSourceSchema,
    dependency_resolution: dependencyResolutionArtifactReferenceSchema,
    materialization_digest: digestSchema,
    package_root: relativePackageRootSchema,
    installed_at: z.number().int().nonnegative(),
    updated_at: z.number().int().nonnegative(),
    curation: catalogCurationLinkSchema.optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      record.curation !== undefined &&
      (record.curation.extension_id !== record.id ||
        record.curation.execution_materialization_digest !==
          record.materialization_digest ||
        (record.curation.source_locator.kind === 'literal' &&
          record.curation.source_locator.extensionId !== record.id))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Catalog curation does not match its execution record',
      })
    }
  })

export type DirectExtensionInstallationRecord = z.infer<
  typeof directExtensionInstallationRecordSchema
>

export type GenericExtensionInstallationRecord =
  DirectExtensionInstallationRecord

export const directExtensionDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    extensions: z.array(directExtensionInstallationRecordSchema),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = new Set<string>()
    for (const extension of document.extensions) {
      if (ids.has(extension.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate direct Extension ${extension.id}`,
        })
      }
      ids.add(extension.id)
    }
  })

export interface DirectExtensionInventoryEntry {
  readonly id: string
  readonly sourceKind: DirectExtensionInstallationRecord['source']['kind']
  readonly requestedTarget: string
  readonly resolvedIdentity: string
  readonly materializationDigest: string
  readonly installedAt: number
  readonly updatedAt: number
  readonly curation?: CatalogCurationLink
}

export function projectDirectExtensionRecord(
  record: DirectExtensionInstallationRecord,
): DirectExtensionInventoryEntry {
  const resolvedIdentity =
    record.source.kind === 'npm'
      ? `${record.source.exact_version}${record.source.integrity === undefined ? '' : ` (${record.source.integrity})`}`
      : record.source.kind === 'git'
        ? record.source.commit
        : record.source.content_digest
  return {
    id: record.id,
    sourceKind: record.source.kind,
    requestedTarget: record.source.requested_target,
    resolvedIdentity,
    materializationDigest: record.materialization_digest,
    installedAt: record.installed_at,
    updatedAt: record.updated_at,
    ...(record.curation === undefined ? {} : { curation: record.curation }),
  }
}
