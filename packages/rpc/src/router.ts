import { os, type RouterClient } from '@orpc/server'
import type { z } from 'zod'
import {
  type RpcHealthInput,
  type RpcHealthResult,
  type RpcRealmAddInput,
  type RpcRealmAddResult,
  type RpcRealmListInput,
  type RpcRealmListResult,
  type RpcRequestContext,
  type RpcResourceGetInput,
  type RpcResourceGetResult,
  type RpcResult,
  type RpcSearchInput,
  type RpcSearchResult,
  type RpcShutdownAccepted,
  type RpcShutdownInput,
  type RpcSourceAddInput,
  type RpcSourceAddResult,
  type RpcSourceDefinitionsInput,
  type RpcSourceDefinitionsResult,
  type RpcSourceListInput,
  type RpcSourceListResult,
  type RpcSourceRemoveInput,
  type RpcSourceRemoveResult,
  type RpcStatusInput,
  type RpcStatusResult,
  type RpcSyncInput,
  type RpcSyncResult,
  type RpcThreadGetInput,
  type RpcThreadGetResult,
  rpcHealthInputSchema,
  rpcHealthResultSchema,
  rpcProtocolIdentitySchema,
  rpcRealmAddInputSchema,
  rpcRealmAddResultSchema,
  rpcRealmListInputSchema,
  rpcRealmListResultSchema,
  rpcRequestContextSchema,
  rpcResourceGetInputSchema,
  rpcResourceGetResultSchema,
  rpcResultSchema,
  rpcRuntimeIdentitySchema,
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
  rpcSyncInputSchema,
  rpcSyncResultSchema,
  rpcThreadGetInputSchema,
  rpcThreadGetResultSchema,
} from './schemas'

export type { RpcRequestContext } from './schemas'

export interface DaemonRpcApplication {
  health(
    input: RpcHealthInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcHealthResult>>
  realmAdd(
    input: RpcRealmAddInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcRealmAddResult>>
  realmList(
    input: RpcRealmListInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcRealmListResult>>
  sourceAdd(
    input: RpcSourceAddInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSourceAddResult>>
  sourceDefinitions(
    input: RpcSourceDefinitionsInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSourceDefinitionsResult>>
  sourceList(
    input: RpcSourceListInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSourceListResult>>
  sourceRemove(
    input: RpcSourceRemoveInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSourceRemoveResult>>
  sync(
    input: RpcSyncInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSyncResult>>
  status(
    input: RpcStatusInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcStatusResult>>
  search(
    input: RpcSearchInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSearchResult>>
  resourceGet(
    input: RpcResourceGetInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcResourceGetResult>>
  threadGet(
    input: RpcThreadGetInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcThreadGetResult>>
  shutdown(
    input: RpcShutdownInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcShutdownAccepted>>
}

export interface DaemonRouterExpectations {
  readonly protocol: z.infer<typeof rpcProtocolIdentitySchema>
  readonly runtime: z.infer<typeof rpcRuntimeIdentitySchema>
}

const INTERNAL_FAILURE = {
  ok: false,
  error: {
    kind: 'ctxindex',
    taxonomy: 'other',
    code: 'internal_error',
    message: 'The daemon could not complete the request.',
  },
} as const

async function validateApplicationResult<TSchema extends z.ZodType>(
  invoke: () => Promise<unknown>,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  // The injected application is the trusted core-to-wire content projector.
  // This package enforces only the closed wire shape and bounds; it does not
  // inspect or rewrite otherwise valid public message strings.
  try {
    const result = schema.safeParse(await invoke())
    if (result.success) return result.data
  } catch {
    // Application failures are replaced with one bounded, transport-safe result.
  }
  return schema.parse(INTERNAL_FAILURE)
}

export function createDaemonRouter(
  application: DaemonRpcApplication,
  expectations: DaemonRouterExpectations,
) {
  const daemonProtocol = rpcProtocolIdentitySchema.parse(expectations.protocol)
  const daemonRuntime = rpcRuntimeIdentitySchema.parse(expectations.runtime)
  const base = os.$context<RpcRequestContext>()
  const compatibility = base.middleware(
    async ({ context, next }, _input, output) => {
      const parsedContext = rpcRequestContextSchema.safeParse(context)
      if (!parsedContext.success) return output(INTERNAL_FAILURE)

      const requestContext = parsedContext.data
      if (
        requestContext.clientProtocol.id !== daemonProtocol.id ||
        requestContext.clientProtocol.version !== daemonProtocol.version
      ) {
        return output({
          ok: false,
          error: {
            kind: 'protocol_incompatible',
            code: 'protocol_incompatible',
            message: 'The client protocol is incompatible with this daemon.',
            clientProtocol: requestContext.clientProtocol,
            daemonProtocol,
          },
        })
      }

      if (
        requestContext.clientRuntime.tupleDigest !==
          daemonRuntime.tupleDigest ||
        requestContext.clientRuntime.configDigest !==
          daemonRuntime.configDigest ||
        requestContext.clientRuntime.dataDigest !== daemonRuntime.dataDigest ||
        requestContext.clientRuntime.stateDigest !==
          daemonRuntime.stateDigest ||
        requestContext.clientRuntime.cacheDigest !==
          daemonRuntime.cacheDigest ||
        requestContext.clientRuntime.databaseDigest !==
          daemonRuntime.databaseDigest
      ) {
        return output({
          ok: false,
          error: {
            kind: 'runtime_identity_mismatch',
            code: 'runtime_identity_mismatch',
            message: 'The client runtime identity does not match this daemon.',
            clientRuntime: requestContext.clientRuntime,
            daemonRuntime,
          },
        })
      }

      return next({ context: requestContext })
    },
  )

  const healthResultSchema = rpcResultSchema(rpcHealthResultSchema)
  const realmAddResultSchema = rpcResultSchema(rpcRealmAddResultSchema)
  const realmListResultSchema = rpcResultSchema(rpcRealmListResultSchema)
  const sourceAddResultSchema = rpcResultSchema(rpcSourceAddResultSchema)
  const sourceDefinitionsResultSchema = rpcResultSchema(
    rpcSourceDefinitionsResultSchema,
  )
  const sourceListResultSchema = rpcResultSchema(rpcSourceListResultSchema)
  const sourceRemoveResultSchema = rpcResultSchema(rpcSourceRemoveResultSchema)
  const syncResultSchema = rpcResultSchema(rpcSyncResultSchema)
  const statusResultSchema = rpcResultSchema(rpcStatusResultSchema)
  const searchResultSchema = rpcResultSchema(rpcSearchResultSchema)
  const resourceGetResultSchema = rpcResultSchema(rpcResourceGetResultSchema)
  const threadGetResultSchema = rpcResultSchema(rpcThreadGetResultSchema)
  const shutdownResultSchema = rpcResultSchema(rpcShutdownAcceptedSchema)

  return {
    system: {
      health: base
        .input(rpcHealthInputSchema)
        .output(healthResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.health(input, context),
            healthResultSchema,
          ),
        ),
      shutdown: base
        .input(rpcShutdownInputSchema)
        .output(shutdownResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.shutdown(input, context),
            shutdownResultSchema,
          ),
        ),
    },
    realm: {
      add: base
        .input(rpcRealmAddInputSchema)
        .output(realmAddResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.realmAdd(input, context),
            realmAddResultSchema,
          ),
        ),
      list: base
        .input(rpcRealmListInputSchema)
        .output(realmListResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.realmList(input, context),
            realmListResultSchema,
          ),
        ),
    },
    source: {
      definitions: base
        .input(rpcSourceDefinitionsInputSchema)
        .output(sourceDefinitionsResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.sourceDefinitions(input, context),
            sourceDefinitionsResultSchema,
          ),
        ),
      add: base
        .input(rpcSourceAddInputSchema)
        .output(sourceAddResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.sourceAdd(input, context),
            sourceAddResultSchema,
          ),
        ),
      list: base
        .input(rpcSourceListInputSchema)
        .output(sourceListResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.sourceList(input, context),
            sourceListResultSchema,
          ),
        ),
      remove: base
        .input(rpcSourceRemoveInputSchema)
        .output(sourceRemoveResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.sourceRemove(input, context),
            sourceRemoveResultSchema,
          ),
        ),
    },
    sync: {
      run: base
        .input(rpcSyncInputSchema)
        .output(syncResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.sync(input, context),
            syncResultSchema,
          ),
        ),
    },
    status: {
      get: base
        .input(rpcStatusInputSchema)
        .output(statusResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.status(input, context),
            statusResultSchema,
          ),
        ),
    },
    search: {
      query: base
        .input(rpcSearchInputSchema)
        .output(searchResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.search(input, context),
            searchResultSchema,
          ),
        ),
    },
    resource: {
      get: base
        .input(rpcResourceGetInputSchema)
        .output(resourceGetResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.resourceGet(input, context),
            resourceGetResultSchema,
          ),
        ),
    },
    thread: {
      get: base
        .input(rpcThreadGetInputSchema)
        .output(threadGetResultSchema)
        .use(compatibility)
        .handler(({ input, context }) =>
          validateApplicationResult(
            () => application.threadGet(input, context),
            threadGetResultSchema,
          ),
        ),
    },
  }
}

export type DaemonRouter = ReturnType<typeof createDaemonRouter>
export type DaemonClient = RouterClient<DaemonRouter>
