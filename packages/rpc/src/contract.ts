import { type ContractRouterClient, eventIterator, oc } from '@orpc/contract'
import {
  rpcActionDescribeInputSchema,
  rpcActionDescribeResultSchema,
  rpcActionRunInputSchema,
  rpcActionRunResultSchema,
  rpcDocumentationGetInputSchema,
  rpcDocumentationGetResultSchema,
  rpcDocumentationListInputSchema,
  rpcDocumentationListResultSchema,
  rpcDocumentationSearchInputSchema,
  rpcDocumentationSearchResultSchema,
  rpcExportInputSchema,
  rpcExportResultSchema,
  rpcFailureRegistry,
  rpcHealthInputSchema,
  rpcHealthResultSchema,
  rpcRealmAddInputSchema,
  rpcRealmAddResultSchema,
  rpcRealmListInputSchema,
  rpcRealmListResultSchema,
  rpcResourceGetInputSchema,
  rpcResourceGetResultSchema,
  rpcSearchInputSchema,
  rpcSearchResultSchema,
  rpcSecretsBackendSetInputSchema,
  rpcSecretsBackendSetResultSchema,
  rpcSecretsStatusInputSchema,
  rpcSecretsStatusResultSchema,
  rpcShutdownAcceptedSchema,
  rpcShutdownInputSchema,
  rpcSourceAddInputSchema,
  rpcSourceAddResultSchema,
  rpcSourceDefinitionsInputSchema,
  rpcSourceDefinitionsResultSchema,
  rpcSourceListInputSchema,
  rpcSourceListResultSchema,
  rpcSourceRemoveInputSchema,
  rpcSourceRemoveResultSchema,
  rpcStatusInputSchema,
  rpcStatusResultSchema,
  rpcSyncEventSchema,
  rpcSyncInputSchema,
  rpcSyncResultSchema,
  rpcThreadGetInputSchema,
  rpcThreadGetResultSchema,
} from './schemas'

const procedure = oc.errors(rpcFailureRegistry)

export const daemonContract = {
  system: {
    health: procedure.input(rpcHealthInputSchema).output(rpcHealthResultSchema),
    shutdown: procedure
      .input(rpcShutdownInputSchema)
      .output(rpcShutdownAcceptedSchema),
  },
  realm: {
    add: procedure
      .input(rpcRealmAddInputSchema)
      .output(rpcRealmAddResultSchema),
    list: procedure
      .input(rpcRealmListInputSchema)
      .output(rpcRealmListResultSchema),
  },
  secrets: {
    status: procedure
      .input(rpcSecretsStatusInputSchema)
      .output(rpcSecretsStatusResultSchema),
    backend: {
      set: procedure
        .input(rpcSecretsBackendSetInputSchema)
        .output(rpcSecretsBackendSetResultSchema),
    },
  },
  documentation: {
    list: procedure
      .input(rpcDocumentationListInputSchema)
      .output(rpcDocumentationListResultSchema),
    get: procedure
      .input(rpcDocumentationGetInputSchema)
      .output(rpcDocumentationGetResultSchema),
    search: procedure
      .input(rpcDocumentationSearchInputSchema)
      .output(rpcDocumentationSearchResultSchema),
  },
  source: {
    definitions: procedure
      .input(rpcSourceDefinitionsInputSchema)
      .output(rpcSourceDefinitionsResultSchema),
    add: procedure
      .input(rpcSourceAddInputSchema)
      .output(rpcSourceAddResultSchema),
    list: procedure
      .input(rpcSourceListInputSchema)
      .output(rpcSourceListResultSchema),
    remove: procedure
      .input(rpcSourceRemoveInputSchema)
      .output(rpcSourceRemoveResultSchema),
  },
  sync: {
    run: procedure
      .input(rpcSyncInputSchema)
      .output(eventIterator(rpcSyncEventSchema, rpcSyncResultSchema)),
  },
  status: {
    get: procedure.input(rpcStatusInputSchema).output(rpcStatusResultSchema),
  },
  search: {
    query: procedure.input(rpcSearchInputSchema).output(rpcSearchResultSchema),
  },
  resource: {
    get: procedure
      .input(rpcResourceGetInputSchema)
      .output(rpcResourceGetResultSchema),
  },
  export: {
    prepare: procedure
      .input(rpcExportInputSchema)
      .output(rpcExportResultSchema),
  },
  thread: {
    get: procedure
      .input(rpcThreadGetInputSchema)
      .output(rpcThreadGetResultSchema),
  },
  action: {
    describe: procedure
      .input(rpcActionDescribeInputSchema)
      .output(rpcActionDescribeResultSchema),
    run: procedure
      .input(rpcActionRunInputSchema)
      .output(rpcActionRunResultSchema),
  },
} as const

export type DaemonContract = typeof daemonContract
export type DaemonClient = ContractRouterClient<DaemonContract>
