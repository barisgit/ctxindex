import {
  defineAdapter,
  defineExtension,
  defineProfile,
  z,
} from '@ctxindex/extension-sdk'

export const invalidNoteProfile = defineProfile({
  id: 'fixture.invalid-note',
  version: 1,
  schema: z.object({ title: z.string() }),
})

export const invalidAdapter = defineAdapter({
  id: 'fixture.invalid-adapter',
  configSchema: z.object({}),
  profiles: [invalidNoteProfile],
  routing: 'indexed',
  capabilities: ['retrieve'],
  operations: {} as never,
  actions: {},
})

export const validSibling = defineExtension({ id: 'fixture.valid-sibling' })

export default defineExtension({
  id: 'fixture.invalid',
  profiles: [invalidNoteProfile],
  adapters: [invalidAdapter],
})
