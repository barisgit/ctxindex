import { defineAdapter } from '@ctxindex/extension-sdk'
import {
  mailMessageDraftCreateInputSchema,
  mailMessageDraftUpdateInputSchema,
  mailMessageProfile,
} from '@ctxindex/profiles'
import { microsoftOAuthProvider } from '../provider'
import { microsoftMailboxSourceConfigSchema } from './config'
import { microsoftMailboxDownload } from './download'
import { microsoftDraftCreate, microsoftDraftUpdate } from './draft'
import { microsoftMailboxRetrieve } from './retrieve'
import { microsoftMailboxSearchRemote } from './search-remote'

export const microsoftMailboxAdapterDefinition = defineAdapter({
  id: 'microsoft.mailbox',
  configSchema: microsoftMailboxSourceConfigSchema,
  provider: microsoftOAuthProvider,
  access: { scopes: ['Mail.ReadWrite'] },
  providerApiHosts: ['graph.microsoft.com'],
  profiles: [mailMessageProfile],
  routing: 'federated',
  capabilities: ['search-remote', 'retrieve', 'download'],
  operations: {
    searchRemote: microsoftMailboxSearchRemote,
    retrieve: microsoftMailboxRetrieve,
    download: microsoftMailboxDownload,
  },
  actions: {
    'mail.message.draft.create': {
      profile: mailMessageProfile,
      input: mailMessageDraftCreateInputSchema,
      output: mailMessageProfile,
      run: microsoftDraftCreate,
    },
    'mail.message.draft.update': {
      profile: mailMessageProfile,
      input: mailMessageDraftUpdateInputSchema,
      output: mailMessageProfile,
      run: microsoftDraftUpdate,
    },
  },
})
