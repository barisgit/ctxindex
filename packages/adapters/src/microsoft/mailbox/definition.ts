import { defineAdapter } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
} from '@ctxindex/profiles'
import { microsoftOAuthProvider } from '../provider'
import { microsoftMailboxSourceConfigSchema } from './config'
import { microsoftMailboxDownload } from './download'
import { microsoftDraftCreate, microsoftDraftUpdate } from './draft'
import { microsoftMailboxRetrieve } from './retrieve'
import { microsoftMailboxSearchRemote } from './search-remote'

export const microsoftMailboxAdapterDefinition = defineAdapter({
  id: 'microsoft.mailbox',
  version: 1,
  configSchema: microsoftMailboxSourceConfigSchema,
  auth: {
    kind: 'oauth2',
    provider: microsoftOAuthProvider,
    scopes: ['Mail.ReadWrite'],
  },
  providerApiHosts: ['graph.microsoft.com'],
  profiles: [{ id: 'communication.message', version: 1 }],
  routing: 'federated',
  capabilities: ['search-remote', 'retrieve', 'download'],
  operations: {
    searchRemote: microsoftMailboxSearchRemote,
    retrieve: microsoftMailboxRetrieve,
    download: microsoftMailboxDownload,
  },
  actions: {
    'communication.message.draft.create': {
      profile: { id: 'communication.message', version: 1 },
      input: communicationMessageDraftCreateInputSchema,
      output: { id: 'communication.message', version: 1 },
      run: microsoftDraftCreate,
    },
    'communication.message.draft.update': {
      profile: { id: 'communication.message', version: 1 },
      input: communicationMessageDraftUpdateInputSchema,
      output: { id: 'communication.message', version: 1 },
      run: microsoftDraftUpdate,
    },
  },
  docs: { summary: 'Microsoft Outlook mailbox' },
})
