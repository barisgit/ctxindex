import { defineExtension } from '@ctxindex/extension-sdk'
import { googleCalendarAdapterDefinition } from './google-calendar/definition'
import { gmailAdapterDefinition } from './google-mailbox/definition'
import { localDirectoryAdapterDefinition } from './local-directory/definition'
import { microsoftCalendarAdapterDefinition } from './microsoft/calendar/definition'
import { microsoftMailboxAdapterDefinition } from './microsoft/mailbox/definition'

export const ctxindexGoogleExtension = defineExtension({
  id: 'ctxindex.google',
  oauthApps: [],
  adapters: [googleCalendarAdapterDefinition, gmailAdapterDefinition],
})

export const ctxindexMicrosoftExtension = defineExtension({
  id: 'ctxindex.microsoft',
  oauthApps: [],
  adapters: [
    microsoftCalendarAdapterDefinition,
    microsoftMailboxAdapterDefinition,
  ],
})

export const ctxindexLocalExtension = defineExtension({
  id: 'ctxindex.local',
  oauthApps: [],
  adapters: [localDirectoryAdapterDefinition],
})

export const CTXINDEX_BUILTIN_EXTENSIONS = [
  ctxindexGoogleExtension,
  ctxindexMicrosoftExtension,
  ctxindexLocalExtension,
] as const
