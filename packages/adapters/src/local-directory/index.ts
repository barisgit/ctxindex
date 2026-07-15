/**
 * @deprecated Prototype sync harness only. This is not a production Adapter
 * definition and must not be imported by task 4.3 or later. Production
 * definitions are registered through CTXINDEX_BUILTIN_EXTENSIONS.
 */
import {
  type AdapterAuthSpec,
  type AdapterCapabilities,
  createSourceAdapter,
  type SyncFunction,
} from '@ctxindex/core/registry'
import { z } from 'zod'
import { localDirectorySync } from './sync'

export const schema = {}
export const localDirectorySchema = schema

export const capabilities = {
  kinds: ['directory'],
  modes: ['sync', 'resync', 'diff'],
  supportsResume: true,
  supportsAttachments: false,
  supportsRawRecords: false,
  supportsRealm: true,
} satisfies AdapterCapabilities

export const localDirectoryCapabilities = capabilities

export const auth = { kind: 'none' } satisfies AdapterAuthSpec
export const localDirectoryAuth = auth

export const configSchema = z
  .object({
    root_path: z.string().optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    size_cap_bytes: z.number().optional(),
  })
  .passthrough()

export const localDirectoryConfigSchema = configSchema

export { localDirectorySync }
export const sync: SyncFunction = localDirectorySync

export const localDirectoryAdapter = createSourceAdapter('local.directory', {
  provider: 'local',
  label: 'Local directory',
  schema,
  configSchema,
  capabilities,
  auth,
  sync,
  searchMode: 'indexed',
})
