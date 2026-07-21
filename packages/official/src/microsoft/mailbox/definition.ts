import { defineAdapter } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
  communicationMessageProfile,
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
  profiles: [communicationMessageProfile],
  routing: 'federated',
  capabilities: ['search-remote', 'retrieve', 'download'],
  operations: {
    searchRemote: microsoftMailboxSearchRemote,
    retrieve: microsoftMailboxRetrieve,
    download: microsoftMailboxDownload,
  },
  actions: {
    'communication.message.draft.create': {
      profile: communicationMessageProfile,
      input: communicationMessageDraftCreateInputSchema,
      output: communicationMessageProfile,
      run: microsoftDraftCreate,
    },
    'communication.message.draft.update': {
      profile: communicationMessageProfile,
      input: communicationMessageDraftUpdateInputSchema,
      output: communicationMessageProfile,
      run: microsoftDraftUpdate,
    },
  },
})
