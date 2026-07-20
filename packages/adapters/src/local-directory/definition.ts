import { defineAdapter } from '@ctxindex/extension-sdk'
import { fileProfile } from '@ctxindex/profiles'
import { localDirectorySourceConfigSchema } from './config'
import { localDirectorySync } from './sync'

export const localDirectoryAdapterDefinition = defineAdapter({
  id: 'local.directory',
  configSchema: localDirectorySourceConfigSchema,
  profiles: [fileProfile],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: { sync: localDirectorySync },
  actions: {},
})
