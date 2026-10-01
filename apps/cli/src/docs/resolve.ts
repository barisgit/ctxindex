import { Buffer } from 'node:buffer'
import {
  createBundledDocumentationSource,
  type DocumentationSource,
} from '@ctxindex/core/documentation'
import { buildBundledDocumentationManifest } from './manifest.macro' with {
  type: 'macro',
}

const embeddedManifest = buildBundledDocumentationManifest()

export function resolveBundledDocumentation(): DocumentationSource {
  return createBundledDocumentationSource(
    embeddedManifest.map((item) => ({
      origin: item.origin,
      path: item.path,
      kind: item.kind,
      mediaType: item.mediaType,
      byteSize: item.byteSize,
      ...(item.title === undefined ? {} : { title: item.title }),
      ...(item.summary === undefined ? {} : { summary: item.summary }),
      content:
        item.kind === 'markdown'
          ? new TextDecoder('utf-8', { fatal: true }).decode(
              Buffer.from(item.contentBase64, 'base64'),
            )
          : new Uint8Array(Buffer.from(item.contentBase64, 'base64')),
    })),
  )
}
