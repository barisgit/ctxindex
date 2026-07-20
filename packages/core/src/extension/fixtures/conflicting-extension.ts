import { defineExtension, defineProfile, z } from '@ctxindex/extension-sdk'

const conflictProfile = defineProfile({
  id: 'fixture.conflict',
  version: 1,
  schema: z.object({ value: z.string() }),
})

export default defineExtension({
  id: 'fixture.builtin',
  profiles: [conflictProfile],
})
