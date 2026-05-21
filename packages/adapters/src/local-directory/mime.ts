import { fileTypeFromBuffer } from 'file-type'

/** MIME types that should be treated as text even if not text/* */
const TEXT_TREATABLE = new Set([
  'application/json',
  'application/xml',
  'application/x-yaml',
  'text/yaml',
  'application/toml',
  'application/x-sh',
  'application/x-shellscript',
  'application/javascript',
  'application/typescript',
  'application/x-typescript',
  'application/wasm', // skip — binary
])

export interface MimeResult {
  mime: string
  isText: boolean
  isBinary: boolean
}

export async function detectMime(absPath: string): Promise<MimeResult> {
  try {
    // Read first 4KB for magic-byte detection
    const file = Bun.file(absPath)
    const slice = await file.slice(0, 4096).arrayBuffer()
    const buf = Buffer.from(slice)
    const result = await fileTypeFromBuffer(buf)

    if (result) {
      const mime = result.mime
      const isText =
        mime.startsWith('text/') ||
        (TEXT_TREATABLE.has(mime) && mime !== 'application/wasm')
      return { mime, isText, isBinary: !isText }
    }

    // No magic bytes found — assume text (source files, config, etc.)
    return { mime: 'text/plain', isText: true, isBinary: false }
  } catch {
    return { mime: 'application/octet-stream', isText: false, isBinary: true }
  }
}
