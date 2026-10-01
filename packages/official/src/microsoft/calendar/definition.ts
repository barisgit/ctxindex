import { defineAdapter } from '@ctxindex/extension-sdk'
import { calendarEventProfile } from '@ctxindex/profiles'
import { microsoftOAuthProvider } from '../provider'
import { microsoftCalendarSourceConfigSchema } from './config'
import { microsoftCalendarRetrieve } from './retrieve'
import { microsoftCalendarSync } from './sync'

export { microsoftCalendarSourceConfigSchema } from './config'

export const microsoftCalendarAdapterDefinition = defineAdapter({
  id: 'microsoft.calendar',
  configSchema: microsoftCalendarSourceConfigSchema,
  provider: microsoftOAuthProvider,
  access: { scopes: ['Calendars.Read'] },
  providerApiHosts: ['graph.microsoft.com'],
  profiles: [calendarEventProfile],
  routing: 'indexed',
  capabilities: ['sync', 'retrieve'],
  operations: {
    sync: microsoftCalendarSync,
    retrieve: microsoftCalendarRetrieve,
  },
  actions: {},
})
