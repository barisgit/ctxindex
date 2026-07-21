import { defineAdapter } from '@ctxindex/extension-sdk'
import { calendarEventProfile } from '@ctxindex/profiles'
import { googleOAuthProvider } from '../google-oauth-provider'
import { googleCalendarSourceConfigSchema } from './config'
import { googleCalendarRetrieve } from './retrieve'
import { googleCalendarSync } from './sync'

export { googleCalendarSourceConfigSchema } from './config'

export const googleCalendarAdapterDefinition = defineAdapter({
  id: 'google.calendar',
  configSchema: googleCalendarSourceConfigSchema,
  provider: googleOAuthProvider,
  access: {
    scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
  },
  providerApiHosts: ['www.googleapis.com'],
  profiles: [calendarEventProfile],
  routing: 'indexed',
  capabilities: ['sync', 'retrieve'],
  operations: {
    sync: googleCalendarSync,
    retrieve: googleCalendarRetrieve,
  },
  actions: {},
})
