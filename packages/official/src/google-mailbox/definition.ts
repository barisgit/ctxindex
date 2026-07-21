import { defineAdapter } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
  communicationMessageProfile,
} from '@ctxindex/profiles'
import { googleOAuthProvider } from '../google-oauth-provider'
import { gmailSourceConfigSchema } from './config'
import { gmailDownload } from './download'
import { gmailDraftCreate, gmailDraftUpdate } from './draft'
import { gmailRetrieve } from './retrieve'
import { gmailSearchRemote } from './search-remote'

export const gmailAdapterDefinition = defineAdapter({
  id: 'google.mailbox',
  configSchema: gmailSourceConfigSchema,
  provider: googleOAuthProvider,
  access: {
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
  },
  providerApiHosts: ['gmail.googleapis.com'],
  profiles: [communicationMessageProfile],
  routing: 'federated',
  capabilities: ['search-remote', 'retrieve', 'download'],
  operations: {
    searchRemote: gmailSearchRemote,
    retrieve: gmailRetrieve,
    download: gmailDownload,
  },
  actions: {
    'communication.message.draft.create': {
      profile: communicationMessageProfile,
      input: communicationMessageDraftCreateInputSchema,
      output: communicationMessageProfile,
      run: gmailDraftCreate,
    },
    'communication.message.draft.update': {
      profile: communicationMessageProfile,
      input: communicationMessageDraftUpdateInputSchema,
      output: communicationMessageProfile,
      run: gmailDraftUpdate,
    },
  },
})
