import { defineAdapter, defineExtension, z } from '@ctxindex/extension-sdk'

const adapter = defineAdapter({
  id: 'fixture.path-identity-adapter',
  configSchema: z.object({}),
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

export default defineExtension({
  id: 'fixture.path-identity',
  adapters: [adapter],
})
