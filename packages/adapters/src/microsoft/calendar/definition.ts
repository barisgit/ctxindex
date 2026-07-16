import { defineAdapter } from '@ctxindex/extension-sdk'
import { microsoftOAuthProvider } from '../provider'
import { microsoftCalendarSourceConfigSchema } from './config'
import { microsoftCalendarRetrieve } from './retrieve'
import { microsoftCalendarSync } from './sync'

export { microsoftCalendarSourceConfigSchema } from './config'

export const microsoftCalendarAdapterDefinition = defineAdapter({
  id: 'microsoft.calendar',
  version: 1,
  configSchema: microsoftCalendarSourceConfigSchema,
  auth: {
    kind: 'oauth2',
    provider: microsoftOAuthProvider,
    scopes: ['Calendars.Read'],
  },
  providerApiHosts: ['graph.microsoft.com'],
  profiles: [{ id: 'calendar.event', version: 1 }],
  routing: 'indexed',
  capabilities: ['sync', 'retrieve'],
  operations: {
    sync: microsoftCalendarSync,
    retrieve: microsoftCalendarRetrieve,
  },
  actions: {},
  docs: { summary: 'Microsoft Calendar events from one selected calendar.' },
})
