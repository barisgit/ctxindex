import { defineExtension } from '@ctxindex/extension-sdk'
import {
  calendarEventProfile,
  communicationMessageProfile,
  fileProfile,
} from '@ctxindex/profiles'
import { googleCalendarAdapterDefinition } from './google-calendar/definition'
import { gmailAdapterDefinition } from './google-mailbox/definition'
import { localDirectoryAdapterDefinition } from './local-directory/definition'
import { microsoftCalendarAdapterDefinition } from './microsoft/calendar/definition'
import { microsoftMailboxAdapterDefinition } from './microsoft/mailbox/definition'

export const ctxindexBuiltinExtension = defineExtension({
  id: 'ctxindex.builtins',
  version: 1,
  profiles: [calendarEventProfile, communicationMessageProfile, fileProfile],
  adapters: [
    googleCalendarAdapterDefinition,
    gmailAdapterDefinition,
    localDirectoryAdapterDefinition,
    microsoftCalendarAdapterDefinition,
    microsoftMailboxAdapterDefinition,
  ],
  docs: { summary: 'Bundled ctxindex definitions.' },
})

export const CTXINDEX_BUILTIN_EXTENSIONS = [ctxindexBuiltinExtension] as const
