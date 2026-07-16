import { defineProfile } from '@ctxindex/extension-sdk'
import { z } from 'zod'

export interface FileChunk {
  index: number
  content: string
}

const CHUNK_TARGET = 1500
const CHUNK_OVERLAP = 200
const CHUNK_MAX = 3000

export function chunkText(text: string): FileChunk[] {
  if (!text.trim()) return []

  const chunks: FileChunk[] = []
  let offset = 0
  let index = 0

  while (offset < text.length) {
    let end = Math.min(offset + CHUNK_TARGET, text.length)

    if (end < text.length) {
      const window = text.slice(
        offset,
        Math.min(offset + CHUNK_MAX, text.length),
      )
      const paragraphIndex = window.lastIndexOf('\n\n')
      if (paragraphIndex > CHUNK_TARGET / 2) {
        end = offset + paragraphIndex + 2
      } else {
        const headingIndex = window.lastIndexOf('\n#')
        if (headingIndex > CHUNK_TARGET / 2) {
          end = offset + headingIndex + 1
        } else {
          const newlineIndex = window.lastIndexOf('\n')
          if (newlineIndex > CHUNK_TARGET / 2) {
            end = offset + newlineIndex + 1
          }
        }
      }
    }

    const content = text.slice(offset, end).trim()
    if (content) chunks.push({ index: index++, content })
    if (end >= text.length) break
    offset = Math.max(offset + 1, end - CHUNK_OVERLAP)
  }

  return chunks
}

export function isNormalizedRelativeFilePath(path: string): boolean {
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    /^[A-Za-z]:[/]/.test(path) ||
    path.includes('\\')
  ) {
    return false
  }
  const segments = path.split('/')
  return segments.every(
    (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
  )
}

function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf('.')
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : undefined
}

export const fileSchema = z
  .object({
    path: z.string().refine(isNormalizedRelativeFilePath),
    name: z.string().min(1),
    mediaType: z.string().min(1),
    byteSize: z.number().int().nonnegative(),
    modifiedAt: z.string().datetime(),
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    text: z.string(),
  })
  .strict()

export const fileProfile = defineProfile({
  id: 'file',
  version: 1,
  schema: fileSchema,
  search: {
    title: (payload) => payload.path,
    occurredAt: (payload) => new Date(payload.modifiedAt),
    chunks: (payload) => chunkText(payload.text).map(({ content }) => content),
    fields: {
      path: { type: 'string', extract: (payload) => payload.path },
      name: { type: 'string', extract: (payload) => payload.name },
      extension: {
        type: 'string',
        extract: (payload) => extensionOf(payload.name),
      },
      mediaType: { type: 'string', extract: (payload) => payload.mediaType },
      size: { type: 'number', extract: (payload) => payload.byteSize },
      modifiedAt: {
        type: 'datetime',
        extract: (payload) => new Date(payload.modifiedAt),
      },
      contentHash: {
        type: 'string',
        extract: (payload) => payload.contentHash,
      },
    },
  },
  docs: {
    summary: 'An extracted local file.',
    aliases: ['files'],
  },
})
