import { defineAdapter } from '@ctxindex/extension-sdk'
import { localDirectorySourceConfigSchema } from './config'
import { localDirectorySync } from './sync'

export const localDirectoryAdapterDefinition = defineAdapter({
  id: 'local.directory',
  version: 1,
  configSchema: localDirectorySourceConfigSchema,
  auth: { kind: 'none' },
  profiles: [{ id: 'file', version: 1 }],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: { sync: localDirectorySync },
  actions: {},
  docs: { summary: 'Local directory' },
})
