import { defineAdapter } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
} from '@ctxindex/profiles'
import { gmailSourceConfigSchema } from './config'
import { gmailDownload } from './download'
import { gmailDraftCreate, gmailDraftUpdate } from './draft'
import { gmailRetrieve } from './retrieve'
import { gmailSearchRemote } from './search-remote'

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
