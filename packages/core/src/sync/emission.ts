import type { SyncEmission } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { CtxindexSyncError } from '../errors'

const nonempty = z.string().min(1)
const nullableString = z.string().nullable().optional()
const nullableNumber = z.number().finite().nullable().optional()
const profile = z
  .object({ id: nonempty, version: z.number().int().positive() })
  .strict()

const resource = z
  .object({
    ref: nonempty,
    profile,
    completeness: z.enum(['partial', 'complete']),
    title: nullableString,
    summary: nullableString,
    occurredAt: nullableNumber,
    providerUpdatedAt: nullableNumber,
    payload: z.unknown(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!Object.hasOwn(value, 'payload') || value.payload === undefined) {
      context.addIssue({ code: 'custom', message: 'payload is required' })
    }
  })

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.string(),
    z.number().finite(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
)

const emissionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('upsertResource'), resource }).strict(),
  z.object({ type: z.literal('removeResource'), ref: nonempty }).strict(),
  z.object({ type: z.literal('checkpoint'), cursor: jsonValue }).strict(),
  z
    .object({
      type: z.literal('warning'),
      code: nonempty,
      message: nonempty,
      ref: nonempty.optional(),
    })
    .strict(),
])

export function parseSyncEmission(value: unknown): SyncEmission {
  const parsed = emissionSchema.safeParse(value)
  if (!parsed.success) {
    throw new CtxindexSyncError(
      `Invalid Sync emission: ${parsed.error.issues[0]?.message ?? 'invalid value'}`,
      'provider_bad_response',
      { cause: parsed.error },
    )
  }
  return parsed.data as SyncEmission
}
