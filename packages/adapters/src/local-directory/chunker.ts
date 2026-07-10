export interface Chunk {
  index: number
  content: string
}

const CHUNK_TARGET = 1500
const CHUNK_OVERLAP = 200
const CHUNK_MAX = 3000

/**
 * Split text into ~1500-char chunks with ~200 overlap.
 * Tries to split at: paragraph > heading > newline > hard-split within 3000-char window.
 */
export function chunkText(text: string): Chunk[] {
  if (!text.trim()) return []

  const chunks: Chunk[] = []
  let offset = 0
  let index = 0

  while (offset < text.length) {
    let end = Math.min(offset + CHUNK_TARGET, text.length)

    if (end < text.length) {
      // Try to find a good split point within CHUNK_MAX window
      const window = text.slice(
        offset,
        Math.min(offset + CHUNK_MAX, text.length),
      )

      // Paragraph break (blank line)
      const paraIdx = window.lastIndexOf('\n\n')
      if (paraIdx > CHUNK_TARGET / 2) {
        end = offset + paraIdx + 2
      } else {
        // Heading (markdown)
        const headingIdx = window.lastIndexOf('\n#')
        if (headingIdx > CHUNK_TARGET / 2) {
          end = offset + headingIdx + 1
        } else {
          // Newline
          const nlIdx = window.lastIndexOf('\n')
          if (nlIdx > CHUNK_TARGET / 2) {
            end = offset + nlIdx + 1
          }
          // else: hard split at CHUNK_TARGET
        }
      }
    }

    const content = text.slice(offset, end).trim()
    if (content) {
      chunks.push({ index, content })
      index++
    }

    // The window reached the end of the text: everything is chunked, stop.
    if (end >= text.length) break

    // Advance with overlap, but always make forward progress past this chunk.
    offset = Math.max(offset + 1, end - CHUNK_OVERLAP)
  }

  return chunks
}
