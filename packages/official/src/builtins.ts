import type { ManagedOAuthAppPolicy } from '@ctxindex/core/oauth-app'
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
import { ctxindexGoogleOAuthApp } from './google-oauth-app'
import { localDirectoryAdapterDefinition } from './local-directory/definition'
import { microsoftCalendarAdapterDefinition } from './microsoft/calendar/definition'
import { microsoftMailboxAdapterDefinition } from './microsoft/mailbox/definition'
import { ctxindexMicrosoftOAuthApp } from './microsoft/oauth-app'

export const ctxindexGoogleExtension = defineExtension({
  id: 'ctxindex.google',
  docs: ctxindexGoogleDocumentation,
  oauthApps: [ctxindexGoogleOAuthApp],
  adapters: [googleCalendarAdapterDefinition, gmailAdapterDefinition],
})

export const ctxindexMicrosoftExtension = defineExtension({
  id: 'ctxindex.microsoft',
  docs: ctxindexMicrosoftDocumentation,
  oauthApps: [ctxindexMicrosoftOAuthApp],
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

export const CTXINDEX_MANAGED_OAUTH_APP_POLICIES = [
  {
    providerId: 'google',
    label: ctxindexGoogleOAuthApp.label,
    extensionId: ctxindexGoogleExtension.id,
    distributions: [{ kind: 'bundled', packageName: '@ctxindex/official' }],
  },
  {
    providerId: 'microsoft',
    label: ctxindexMicrosoftOAuthApp.label,
    extensionId: ctxindexMicrosoftExtension.id,
    distributions: [{ kind: 'bundled', packageName: '@ctxindex/official' }],
  },
] as const satisfies readonly ManagedOAuthAppPolicy[]
