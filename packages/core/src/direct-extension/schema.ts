import { isAbsolute, posix } from 'node:path'
import { z } from 'zod'

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/)
const extensionIdSchema = z
  .string()
  .max(128)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)

function credentialFree(value: string): boolean {
  if (/^(?:git\+)?ssh:/i.test(value) || /^[^/@\s]+@[^/\s]+:/.test(value)) {
    return false
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true
  try {
    const parsed = new URL(value.replace(/^git\+/, ''))
    return parsed.username.length === 0 && parsed.password.length === 0
  } catch {
    return true
  }
}

const requestedTargetSchema = z
  .string()
  .min(1)
  .refine(credentialFree, 'Extension target must not contain credentials')

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
      exact_version: z.string().min(1),
      integrity: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('git'),
      requested_target: requestedTargetSchema,
      commit: z.string().regex(/^[0-9a-f]{40,64}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('local'),
      requested_target: requestedTargetSchema.refine(isAbsolute),
      origin_path: z.string().refine(isAbsolute),
      content_digest: digestSchema,
    })
    .strict(),
])

export const directExtensionInstallationRecordSchema = z
  .object({
    id: extensionIdSchema,
    source: directExtensionSourceSchema,
    materialization_digest: digestSchema,
    package_root: relativePackageRootSchema,
    installed_at: z.number().int().nonnegative(),
    updated_at: z.number().int().nonnegative(),
  })
  .strict()

export type DirectExtensionInstallationRecord = z.infer<
  typeof directExtensionInstallationRecordSchema
>

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
  }
}
