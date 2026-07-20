import { defineAdapter, defineExtension, z } from '@ctxindex/extension-sdk'

const adapter = defineAdapter({
  id: 'fixture.direct.local-adapter',
  configSchema: z.object({}),
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

export const buildMarker = 'local-v1'
export default defineExtension({
  id: 'fixture.direct.local',
  adapters: [adapter],
})
