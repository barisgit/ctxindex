import { defineExtension, defineProfile, z } from '@ctxindex/extension-sdk'

export const fixtureNoteProfile = defineProfile({
  id: 'fixture.note',
  version: 1,
  schema: z.object({ title: z.string() }),
  search: { title: (payload) => payload.title },
})

export default defineExtension({
  id: 'fixture.external',
  profiles: [fixtureNoteProfile],
})
