import type { ExtensionAuthoringHost } from '@ctxindex/extension-sdk'

export default function extension(host: ExtensionAuthoringHost) {
  return host.defineExtension({
    id: 'fixture.builtin',
    version: 1,
    profiles: [],
    adapters: [],
  })
}
