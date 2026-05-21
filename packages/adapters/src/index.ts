import { createCtxindexAdapterRegistry } from '@ctxindex/core/registry'
import { googleMailboxAdapter } from './google-mailbox'
import { localDirectoryAdapter } from './local-directory'

export {
  googleMailboxAdapter,
  googleMailboxAuth,
  googleMailboxCapabilities,
  googleMailboxConfigSchema,
  googleMailboxMigrations,
  googleMailboxSchema,
  googleMailboxSync,
} from './google-mailbox'
export {
  localDirectoryAdapter,
  localDirectoryAuth,
  localDirectoryCapabilities,
  localDirectoryConfigSchema,
  localDirectoryMigrations,
  localDirectorySchema,
  localDirectorySync,
} from './local-directory'

export const CTXINDEX_ADAPTER_REGISTRY = createCtxindexAdapterRegistry({
  'local.directory': localDirectoryAdapter,
  'google.mailbox': googleMailboxAdapter,
})

export type CtxindexAdapterId =
  (typeof CTXINDEX_ADAPTER_REGISTRY.adapterIds)[number]
