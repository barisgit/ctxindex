import { type ContractRouterClient, eventIterator, oc } from '@orpc/contract'
import {
  rpcDocumentationGetInputSchema,
  rpcDocumentationGetResultSchema,
  rpcDocumentationListInputSchema,
  rpcDocumentationListResultSchema,
  rpcDocumentationSearchInputSchema,
  rpcDocumentationSearchResultSchema,
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
  thread: {
    get: procedure
      .input(rpcThreadGetInputSchema)
      .output(rpcThreadGetResultSchema),
  },
} as const

export type DaemonContract = typeof daemonContract
export type DaemonClient = ContractRouterClient<DaemonContract>
