import { defineAdapter, defineExtension, z } from '@ctxindex/extension-sdk'
import { suffix } from 'extension-fixture-dep'
import { typedHelper } from './helper'

const adapter = defineAdapter({
  id: `fixture.adapter.${typedHelper('typescript')}${suffix}`,
  configSchema: z.object({}),
  profiles: [],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

export default defineExtension({
  id: 'fixture.extension',
  adapters: [adapter],
})
