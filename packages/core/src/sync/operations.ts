import { z } from 'zod'

/**
 * Canonical SyncOperation union emitted by adapters and consumed by the
 * sync service. Mirrors `IMPLEMENTATION.md §3d.2` and the op types applied
 * inline by `apps/cli/src/commands/sync.ts` today.
 *
 * Adapters MAY emit additional fields beyond what is declared here; the
 * schema is intentionally permissive (`.passthrough()`) so we do not break
 * the wire format while iterating on op shape.
 */

const UpsertItemOpSchema = z
  .object({
    type: z.literal('upsertItem'),
    itemId: z.string(),
    sourceId: z.string().optional(),
    uri: z.string().optional(),
    title: z.string().optional(),
    kind: z.string().optional(),
    contentHash: z.string().optional(),
    byteSize: z.number().optional(),
    indexedAt: z.number().optional(),
    mtime: z.number().optional(),
    relativePath: z.string().optional(),
  })
  .passthrough()

const UpsertChunkOpSchema = z
  .object({
    type: z.literal('upsertChunk'),
    itemId: z.string(),
    chunkId: z.string().optional(),
    chunkIndex: z.number().optional(),
    content: z.string(),
  })
  .passthrough()

const UpsertMailMessageOpSchema = z
  .object({
    type: z.literal('upsertMailMessage'),
    itemId: z.string(),
    messageId: z.string().optional(),
    threadId: z.string().optional(),
    subject: z.string().optional(),
    from: z.string().nullable().optional(),
    to: z.unknown().optional(),
    cc: z.unknown().optional(),
    date: z.number().optional(),
    snippet: z.string().optional(),
    labelIds: z.unknown().optional(),
  })
  .passthrough()

const UpsertMailAttachmentOpSchema = z
  .object({
    type: z.literal('upsertMailAttachment'),
    itemId: z.string(),
    attachmentId: z.string().optional(),
    filename: z.string().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.number().nullable().optional(),
    providerAttachmentId: z.string().nullable().optional(),
  })
  .passthrough()

const UpsertExternalRefOpSchema = z
  .object({
    type: z.literal('upsertExternalRef'),
    itemId: z.string(),
    kind: z.string(),
    value: z.union([z.string(), z.unknown()]),
  })
  .passthrough()

const TombstoneOpSchema = z
  .object({
    type: z.literal('tombstone'),
    itemId: z.string(),
    deletedAt: z.number().optional(),
    reason: z.string().optional(),
  })
  .passthrough()

const CheckpointOpSchema = z
  .object({
    type: z.literal('checkpoint'),
    cursor: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    counts: z.record(z.string(), z.number()).optional(),
  })
  .passthrough()

const SetCursorOpSchema = z
  .object({
    type: z.literal('setCursor'),
    cursor: z.unknown().optional(),
  })
  .passthrough()

const RawRecordOpSchema = z
  .object({
    type: z.literal('rawRecord'),
    itemId: z.string(),
    payload: z.unknown().optional(),
  })
  .passthrough()

const ErrorOpSchema = z
  .object({
    type: z.literal('error'),
    message: z.string().optional(),
    code: z.string().optional(),
  })
  .passthrough()

const CancelledOpSchema = z
  .object({
    type: z.literal('cancelled'),
  })
  .passthrough()

/** Union of all canonical sync op shapes. */
export const SyncOperationSchema = z.union([
  UpsertItemOpSchema,
  UpsertChunkOpSchema,
  UpsertMailMessageOpSchema,
  UpsertMailAttachmentOpSchema,
  UpsertExternalRefOpSchema,
  TombstoneOpSchema,
  CheckpointOpSchema,
  SetCursorOpSchema,
  RawRecordOpSchema,
  ErrorOpSchema,
  CancelledOpSchema,
])

export type SyncOperation = z.infer<typeof SyncOperationSchema>

export type UpsertItemOp = z.infer<typeof UpsertItemOpSchema>
export type UpsertChunkOp = z.infer<typeof UpsertChunkOpSchema>
export type UpsertMailMessageOp = z.infer<typeof UpsertMailMessageOpSchema>
export type UpsertMailAttachmentOp = z.infer<
  typeof UpsertMailAttachmentOpSchema
>
export type UpsertExternalRefOp = z.infer<typeof UpsertExternalRefOpSchema>
export type TombstoneOp = z.infer<typeof TombstoneOpSchema>
export type CheckpointOp = z.infer<typeof CheckpointOpSchema>
export type SetCursorOp = z.infer<typeof SetCursorOpSchema>
export type RawRecordOp = z.infer<typeof RawRecordOpSchema>
export type ErrorOp = z.infer<typeof ErrorOpSchema>
export type CancelledOp = z.infer<typeof CancelledOpSchema>
