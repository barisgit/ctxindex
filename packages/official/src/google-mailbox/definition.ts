import { defineAdapter } from '@ctxindex/extension-sdk'
import {
  mailMessageDraftCreateInputSchema,
  mailMessageDraftUpdateInputSchema,
  mailMessageProfile,
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
  profiles: [mailMessageProfile],
  routing: 'federated',
  capabilities: ['search-remote', 'retrieve', 'download'],
  operations: {
    searchRemote: gmailSearchRemote,
    retrieve: gmailRetrieve,
    download: gmailDownload,
  },
  actions: {
    'mail.message.draft.create': {
      profile: mailMessageProfile,
      input: mailMessageDraftCreateInputSchema,
      output: mailMessageProfile,
      run: gmailDraftCreate,
    },
    'mail.message.draft.update': {
      profile: mailMessageProfile,
      input: mailMessageDraftUpdateInputSchema,
      output: mailMessageProfile,
      run: gmailDraftUpdate,
    },
  },
})
