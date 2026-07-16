import { defineAdapter, defineExtension } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
  communicationMessageProfile,
  fileProfile,
} from '@ctxindex/profiles'
import { z } from 'zod'
import { gmailDownload } from './gmail-download'
import { gmailDraftCreate, gmailDraftUpdate } from './gmail-draft'
import { gmailRetrieve } from './gmail-retrieve'
import { gmailSearchRemote } from './gmail-search-remote'
import { localDirectorySourceConfigSchema } from './local-directory/config'
import { localDirectorySync } from './local-directory/sync'

export const gmailSourceConfigSchema = z
  .object({
    raw_records_enabled: z.boolean().optional(),
    labels_include: z.array(z.string()).optional(),
    labels_exclude: z.array(z.string()).optional(),
    sync_window_days: z.number().int().min(0).optional(),
  })
  .strict()

export { localDirectorySourceConfigSchema } from './local-directory/config'

export const gmailAdapterDefinition = defineAdapter({
  id: 'google.mailbox',
  version: 1,
  configSchema: gmailSourceConfigSchema,
  auth: {
    kind: 'oauth2',
    provider: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
  },
  profiles: [{ id: 'communication.message', version: 1 }],
  routing: 'federated',
  capabilities: ['search-remote', 'retrieve', 'download'],
  operations: {
    searchRemote: gmailSearchRemote,
    retrieve: gmailRetrieve,
    download: gmailDownload,
  },
  actions: {
    'communication.message.draft.create': {
      profile: { id: 'communication.message', version: 1 },
      input: communicationMessageDraftCreateInputSchema,
      output: { id: 'communication.message', version: 1 },
      run: gmailDraftCreate,
    },
    'communication.message.draft.update': {
      profile: { id: 'communication.message', version: 1 },
      input: communicationMessageDraftUpdateInputSchema,
      output: { id: 'communication.message', version: 1 },
      run: gmailDraftUpdate,
    },
  },
  docs: { summary: 'Google Mail (Gmail)' },
})

export const localDirectoryAdapterDefinition = defineAdapter({
  id: 'local.directory',
  version: 1,
  configSchema: localDirectorySourceConfigSchema,
  auth: { kind: 'none' },
  profiles: [{ id: 'file', version: 1 }],
  routing: 'indexed',
  capabilities: ['sync'],
  operations: { sync: localDirectorySync },
  actions: {},
  docs: { summary: 'Local directory' },
})

export const ctxindexBuiltinExtension = defineExtension({
  id: 'ctxindex.builtins',
  version: 1,
  profiles: [communicationMessageProfile, fileProfile],
  adapters: [gmailAdapterDefinition, localDirectoryAdapterDefinition],
  docs: { summary: 'Bundled ctxindex definitions.' },
})

export const CTXINDEX_BUILTIN_EXTENSIONS = [ctxindexBuiltinExtension] as const
