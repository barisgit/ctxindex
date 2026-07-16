import { defineAdapter } from '@ctxindex/extension-sdk'
import { googleOAuthProvider } from '../google-oauth-provider'
import { googleCalendarSourceConfigSchema } from './config'
import { googleCalendarRetrieve } from './retrieve'
import { googleCalendarSync } from './sync'

export { googleCalendarSourceConfigSchema } from './config'

export const googleCalendarAdapterDefinition = defineAdapter({
  id: 'google.calendar',
  version: 1,
  configSchema: googleCalendarSourceConfigSchema,
  auth: {
    kind: 'oauth2',
    provider: googleOAuthProvider,
    scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
  },
  providerApiHosts: ['www.googleapis.com'],
  profiles: [{ id: 'calendar.event', version: 1 }],
  routing: 'indexed',
  capabilities: ['sync', 'retrieve'],
  operations: {
    sync: googleCalendarSync,
    retrieve: googleCalendarRetrieve,
  },
  actions: {},
  docs: { summary: 'Google Calendar events from one selected calendar.' },
})
