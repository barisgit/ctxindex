import type { ExtensionAuthoringHost } from '@ctxindex/extension-sdk'

export default function extension(host: ExtensionAuthoringHost) {
  const profile = host.defineProfile({
    id: 'fixture.invalid-note',
    version: 1,
    schema: host.z.object({ title: host.z.string() }),
  })
  const adapter = host.defineAdapter({
    id: 'fixture.invalid-adapter',
    version: 1,
    configSchema: host.z.object({}),
    auth: { kind: 'none' },
    profiles: [{ id: profile.id, version: profile.version }],
    capabilities: ['retrieve'],
    operations: {} as never,
    actions: {},
  })

  return host.defineExtension({
    id: 'fixture.invalid',
    version: 1,
    profiles: [profile],
    adapters: [adapter],
  })
}
