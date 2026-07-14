import type { ExtensionAuthoringHost } from '@ctxindex/extension-sdk'

export default function extension(host: ExtensionAuthoringHost) {
  const profile = host.defineProfile({
    id: 'fixture.note',
    version: 1,
    schema: host.z.object({ title: host.z.string() }),
    search: { title: (payload) => payload.title },
  })

  return host.defineExtension({
    id: 'fixture.external',
    version: 1,
    profiles: [profile],
    adapters: [],
  })
}
