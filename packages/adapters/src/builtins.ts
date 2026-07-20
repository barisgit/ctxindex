import {
  type AnyExtensionDefinition,
  defineExtension,
} from '@ctxindex/extension-sdk'
import {
  ctxindexGoogleDocumentation,
  ctxindexLocalDocumentation,
  ctxindexMicrosoftDocumentation,
} from './generated/documentation'
import { googleCalendarAdapterDefinition } from './google-calendar/definition'
import { gmailAdapterDefinition } from './google-mailbox/definition'
import { localDirectoryAdapterDefinition } from './local-directory/definition'
import { microsoftCalendarAdapterDefinition } from './microsoft/calendar/definition'
import { microsoftMailboxAdapterDefinition } from './microsoft/mailbox/definition'

export const ctxindexGoogleExtension = defineExtension({
  id: 'ctxindex.google',
  docs: ctxindexGoogleDocumentation,
  oauthApps: [],
  adapters: [googleCalendarAdapterDefinition, gmailAdapterDefinition],
})

export const ctxindexMicrosoftExtension = defineExtension({
  id: 'ctxindex.microsoft',
  docs: ctxindexMicrosoftDocumentation,
  oauthApps: [],
  adapters: [
    microsoftCalendarAdapterDefinition,
    microsoftMailboxAdapterDefinition,
  ],
})

export const ctxindexLocalExtension = defineExtension({
  id: 'ctxindex.local',
  docs: ctxindexLocalDocumentation,
  oauthApps: [],
  adapters: [localDirectoryAdapterDefinition],
})

function withoutDocumentation<T extends AnyExtensionDefinition>(
  extension: T,
): Omit<T, 'docs'> {
  const { docs: _documentation, ...definition } = extension
  return definition
}

export const CTXINDEX_BUILTIN_EXTENSIONS = [
  withoutDocumentation(ctxindexGoogleExtension),
  withoutDocumentation(ctxindexMicrosoftExtension),
  withoutDocumentation(ctxindexLocalExtension),
] as const
