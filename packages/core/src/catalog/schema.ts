import { isAbsolute, posix } from 'node:path'
import { z } from 'zod'
import { validateCatalogRef, validateCatalogRepository } from './repository'

export const CATALOG_MANIFEST_MAX_BYTES = 256 * 1024
export const CATALOG_MAX_ENTRIES = 256
export const CATALOG_PATH_MAX_BYTES = 1024
export const CATALOG_SETUP_MAX_BYTES = 1024 * 1024

const identifierSchema = z.string().min(1)
const extensionVersionSchema = z.number().int().positive()

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

const catalogNameSchema = validatedString(validateCatalogName)
const catalogRepositorySchema = validatedString(validateCatalogRepository)
const catalogRefSchema = validatedString(validateCatalogRef)
const catalogRelativePathSchema = validatedString(validateCatalogRelativePath)

export const catalogManifestEntrySchema = z
  .object({
    id: identifierSchema,
    version: extensionVersionSchema,
    source: z
      .object({
        kind: z.literal('inline'),
        path: z.string(),
      })
      .strict(),
    setup: z.object({ path: z.string() }).strict().optional(),
  })
  .strict()

export const catalogManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalog: z
      .object({
        id: identifierSchema,
        name: z.string().min(1),
        summary: z.string().min(1).optional(),
      })
      .strict(),
    extensions: z.array(catalogManifestEntrySchema).max(CATALOG_MAX_ENTRIES),
  })
  .strict()

export type CatalogManifestEntry = z.infer<typeof catalogManifestEntrySchema>
export type CatalogManifest = z.infer<typeof catalogManifestSchema>

export const catalogRecordSchema = z
  .object({
    name: catalogNameSchema,
    repository: catalogRepositorySchema,
    ref: catalogRefSchema,
    commit: z.string().regex(/^[0-9a-f]{40,64}$/),
    catalog_id: identifierSchema,
    catalog_name: z.string().min(1),
    summary: z.string().min(1).optional(),
    extensions: z
      .array(
        z
          .object({
            id: identifierSchema,
            version: extensionVersionSchema,
            source_path: catalogRelativePathSchema,
            setup_path: catalogRelativePathSchema.optional(),
          })
          .strict(),
      )
      .max(CATALOG_MAX_ENTRIES)
      .superRefine((entries, context) => {
        const identities = new Set<string>()
        for (const entry of entries) {
          const identity = `${entry.id}@${entry.version}`
          if (identities.has(identity)) {
            context.addIssue({
              code: 'custom',
              message: `Duplicate Catalog Extension ${identity}`,
            })
          }
          identities.add(identity)
        }
      }),
  })
  .strict()

export type CatalogRecord = z.infer<typeof catalogRecordSchema>

export const installedExtensionRecordSchema = z
  .object({
    id: identifierSchema,
    version: extensionVersionSchema,
    catalog_name: catalogNameSchema,
    catalog_id: identifierSchema,
    repository: catalogRepositorySchema,
    commit: z.string().regex(/^[0-9a-f]{40,64}$/),
    source_path: catalogRelativePathSchema,
    setup_path: catalogRelativePathSchema.optional(),
  })
  .strict()

export type InstalledExtensionRecord = z.infer<
  typeof installedExtensionRecordSchema
>

export const catalogsDocumentSchema = z
  .object({
    schema_version: z.literal(1),
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

export const installedExtensionsDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    extensions: z.array(installedExtensionRecordSchema),
  })
  .strict()
  .superRefine((document, context) => {
    const identities = new Set<string>()
    for (const extension of document.extensions) {
      const identity = `${extension.id}@${extension.version}`
      if (identities.has(identity)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate installed Extension ${identity}`,
        })
      }
      identities.add(identity)
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
  const manifest = catalogManifestSchema.parse(parsed)
  const identities = new Set<string>()
  for (const entry of manifest.extensions) {
    const identity = `${entry.id}@${entry.version}`
    if (identities.has(identity)) {
      throw new TypeError(`Duplicate Catalog Extension ${identity}`)
    }
    identities.add(identity)
  }
  return manifest
}
