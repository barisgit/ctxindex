import { isAbsolute, posix } from 'node:path'
import { z } from 'zod'
import { validateCatalogRef, validateCatalogRepository } from './repository'

export const CATALOG_MANIFEST_MAX_BYTES = 256 * 1024
export const CATALOG_MAX_ENTRIES = 256
export const CATALOG_PATH_MAX_BYTES = 1024
export const CATALOG_RESOLUTION_MAX_BYTES = 1024 * 1024
export const CATALOG_RESOLUTION_TOTAL_MAX_BYTES = 8 * 1024 * 1024

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/)
const identifierSchema = z
  .string()
  .max(128)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
const packageNameSchema = z
  .string()
  .regex(
    /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i,
  )
const commitSchema = z.string().regex(/^[0-9a-f]{40,64}$/)
const catalogNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function validateCatalogName(name: string): string {
  if (
    name === '.' ||
    name === '..' ||
    !catalogNamePattern.test(name) ||
    Buffer.byteLength(name, 'utf8') > 128
  ) {
    throw new TypeError(`Invalid Catalog name ${JSON.stringify(name)}`)
  }
  return name
}

export function validateCatalogRelativePath(path: string): string {
  const segments = path.split('/')
  if (
    path.length === 0 ||
    path.includes('\0') ||
    path.includes('\\') ||
    isAbsolute(path) ||
    Buffer.byteLength(path, 'utf8') > CATALOG_PATH_MAX_BYTES ||
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..',
    ) ||
    posix.normalize(path) !== path
  ) {
    throw new TypeError(`Unsafe Catalog path ${JSON.stringify(path)}`)
  }
  return path
}

export function validateCatalogPackagePath(path: string): string {
  if (path === '.') return path
  return validateCatalogRelativePath(path)
}

function validatedString(validate: (value: string) => string): z.ZodString {
  return z.string().superRefine((value, context) => {
    try {
      validate(value)
    } catch (cause) {
      context.addIssue({
        code: 'custom',
        message: cause instanceof Error ? cause.message : 'Invalid value',
      })
    }
  })
}

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
const catalogNameSchema = validatedString(validateCatalogName)
const catalogRepositorySchema = validatedString(validateCatalogRepository)
const catalogRefSchema = validatedString(validateCatalogRef)
const catalogRelativePathSchema = validatedString(validateCatalogRelativePath)
const catalogPackagePathSchema = validatedString(validateCatalogPackagePath)

export const catalogExactSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('npm'),
      requestedTarget: requestedTargetSchema,
      package: packageNameSchema,
      version: z.string().min(1),
      integrity: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('git'),
      requestedTarget: requestedTargetSchema,
      repository: repositoryIdentitySchema,
      commit: commitSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('local'),
      requestedTarget: requestedTargetSchema,
      path: catalogPackagePathSchema,
      contentDigest: digestSchema,
    })
    .strict(),
])

export const catalogResolutionArtifactSchema = z
  .object({
    format: z.literal('bun.lock@1.3.14'),
    path: catalogRelativePathSchema,
    digest: digestSchema,
    byteLength: z.number().int().positive().max(CATALOG_RESOLUTION_MAX_BYTES),
  })
  .strict()

export const catalogReplayPayloadSchema = z
  .object({
    source: catalogExactSourceSchema,
    packageRoot: catalogPackagePathSchema,
    materializationDigest: digestSchema,
    lock: catalogResolutionArtifactSchema,
  })
  .strict()

const catalogLiteralLocatorSchema = z
  .object({
    module: catalogRelativePathSchema,
    catalogId: identifierSchema,
    entryIndex: z
      .number()
      .int()
      .nonnegative()
      .max(CATALOG_MAX_ENTRIES - 1),
    extensionId: identifierSchema,
  })
  .strict()

export const catalogManifestEntrySchema = z
  .object({
    id: identifierSchema,
    summary: z.string().min(1).optional(),
    source: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('package'),
          replay: catalogReplayPayloadSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal('literal'),
          authorPackage: catalogReplayPayloadSchema,
          locator: catalogLiteralLocatorSchema,
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((entry, context) => {
    if (
      entry.source.kind === 'literal' &&
      entry.source.locator.extensionId !== entry.id
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Catalog literal locator identity must match its entry',
      })
    }
  })

function validateCatalogEntries(
  entries: readonly CatalogManifestEntry[],
  context: z.RefinementCtx,
): void {
  const ids = new Set<string>()
  for (const [index, extension] of entries.entries()) {
    if (ids.has(extension.id)) {
      context.addIssue({
        code: 'custom',
        path: ['extensions', index, 'id'],
        message: `Duplicate Catalog Extension ${extension.id}`,
      })
    }
    ids.add(extension.id)
  }
  const artifacts = new Map<
    string,
    Pick<CatalogResolutionArtifact, 'format' | 'digest' | 'byteLength'>
  >()
  for (const extension of entries) {
    const replay =
      extension.source.kind === 'literal'
        ? extension.source.authorPackage
        : extension.source.replay
    const prior = artifacts.get(replay.lock.path)
    if (
      prior !== undefined &&
      (prior.format !== replay.lock.format ||
        prior.digest !== replay.lock.digest ||
        prior.byteLength !== replay.lock.byteLength)
    ) {
      context.addIssue({
        code: 'custom',
        message: `Conflicting Catalog resolution artifact ${replay.lock.path}`,
      })
    }
    artifacts.set(replay.lock.path, replay.lock)
  }
  const total = [...artifacts.values()].reduce(
    (sum, artifact) => sum + artifact.byteLength,
    0,
  )
  if (total > CATALOG_RESOLUTION_TOTAL_MAX_BYTES) {
    context.addIssue({
      code: 'custom',
      message: 'Catalog resolution artifacts exceed the aggregate bound',
    })
  }
}

export const catalogManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    catalog: z
      .object({
        id: identifierSchema,
        label: z.string().min(1),
        summary: z.string().min(1).optional(),
      })
      .strict(),
    generated: z
      .object({
        packageName: z.string().min(1),
        packageVersion: z.string().min(1),
      })
      .strict(),
    extensions: z.array(catalogManifestEntrySchema).max(CATALOG_MAX_ENTRIES),
  })
  .strict()
  .superRefine((manifest, context) => {
    validateCatalogEntries(manifest.extensions, context)
  })

export type CatalogExactSource = z.infer<typeof catalogExactSourceSchema>
export type CatalogResolutionArtifact = z.infer<
  typeof catalogResolutionArtifactSchema
>
export type CatalogReplayPayload = z.infer<typeof catalogReplayPayloadSchema>
export type CatalogManifestEntry = z.infer<typeof catalogManifestEntrySchema>
export type CatalogManifest = z.infer<typeof catalogManifestSchema>

export const catalogRecordSchema = z
  .object({
    name: catalogNameSchema,
    repository: catalogRepositorySchema,
    ref: catalogRefSchema,
    commit: commitSchema,
    snapshot_acquired_at: z.number().int().nonnegative(),
    catalog_id: identifierSchema,
    catalog_label: z.string().min(1),
    summary: z.string().min(1).optional(),
    generated: catalogManifestSchema.shape.generated,
    extensions: z.array(catalogManifestEntrySchema).max(CATALOG_MAX_ENTRIES),
  })
  .strict()
  .superRefine((record, context) => {
    validateCatalogEntries(record.extensions, context)
  })

export type CatalogRecord = z.infer<typeof catalogRecordSchema>

export const catalogsDocumentSchema = z
  .object({
    schema_version: z.literal(2),
    catalogs: z.array(catalogRecordSchema),
  })
  .strict()
  .superRefine((document, context) => {
    const names = new Set<string>()
    const ids = new Set<string>()
    for (const catalog of document.catalogs) {
      if (names.has(catalog.name)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate Catalog name ${catalog.name}`,
        })
      }
      if (ids.has(catalog.catalog_id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate Catalog id ${catalog.catalog_id}`,
        })
      }
      names.add(catalog.name)
      ids.add(catalog.catalog_id)
    }
  })

export function parseCatalogManifest(text: string): CatalogManifest {
  if (Buffer.byteLength(text, 'utf8') > CATALOG_MANIFEST_MAX_BYTES) {
    throw new TypeError('Catalog manifest exceeds 256 KiB')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new TypeError('Catalog manifest is not valid JSON', { cause })
  }
  return catalogManifestSchema.parse(parsed)
}
