import type {
  AnyContractProcedure,
  InferContractRouterInputs,
  InferContractRouterOutputs,
} from '@orpc/contract'
import { type createORPCErrorConstructorMap, implement } from '@orpc/server'
import type { z } from 'zod'
import { daemonContract } from './contract'
import {
  type RpcFailure,
  type RpcRequestContext,
  type RpcResult,
  type RpcTransportContext,
  type rpcFailureRegistry,
  rpcHealthResultSchema,
  rpcProtocolIdentitySchema,
  rpcRealmAddResultSchema,
  rpcRealmListResultSchema,
  rpcResourceGetResultSchema,
  rpcResultSchema,
  rpcRuntimeIdentitySchema,
  rpcSearchResultSchema,
  rpcShutdownAcceptedSchema,
  rpcSourceAddResultSchema,
  rpcSourceDefinitionsResultSchema,
  rpcSourceListResultSchema,
  rpcSourceRemoveResultSchema,
  rpcStatusResultSchema,
  rpcSyncResultSchema,
  rpcThreadGetResultSchema,
  rpcTransportContextSchema,
} from './schemas'

export type { DaemonClient } from './contract'
export type { RpcRequestContext, RpcTransportContext } from './schemas'

type ContractApplication<Contract, Input, Output> =
  Contract extends AnyContractProcedure
    ? (input: Input, context: RpcRequestContext) => Promise<RpcResult<Output>>
    : {
        [Key in keyof Contract]: Key extends keyof Input
          ? Key extends keyof Output
            ? ContractApplication<Contract[Key], Input[Key], Output[Key]>
            : never
          : never
      }

export type DaemonRpcApplication = ContractApplication<
  typeof daemonContract,
  InferContractRouterInputs<typeof daemonContract>,
  InferContractRouterOutputs<typeof daemonContract>
>

export interface DaemonRouterExpectations {
  readonly protocol: z.infer<typeof rpcProtocolIdentitySchema>
  readonly runtime: z.infer<typeof rpcRuntimeIdentitySchema>
}

const INTERNAL_FAILURE = {
  kind: 'ctxindex',
  taxonomy: 'other',
  code: 'internal_error',
  message: 'The daemon could not complete the request.',
} as const

type FailureErrorFactories = ReturnType<
  typeof createORPCErrorConstructorMap<typeof rpcFailureRegistry>
>

function declaredError<Kind extends RpcFailure['kind']>(
  errors: FailureErrorFactories,
  failure: Extract<RpcFailure, { kind: Kind }>,
): Error {
  // Indexed access cannot retain the discriminant/factory correlation. The
  // registry-backed runtime tests verify this isolated bridge for every kind.
  const create = errors[failure.kind] as (options: {
    data: RpcFailure
  }) => Error
  return create({ data: failure })
}

async function invokeApplication<TSchema extends z.ZodType>(
  invoke: () => Promise<unknown>,
  outputSchema: TSchema,
  errors: FailureErrorFactories,
): Promise<z.output<TSchema>> {
  let data: RpcResult<z.output<TSchema>>
  try {
    const value = await invoke()
    const result = rpcResultSchema(outputSchema).safeParse(value)
    if (!result.success) throw new TypeError('Invalid application result')
    data = result.data as RpcResult<z.output<TSchema>>
  } catch {
    throw declaredError(errors, INTERNAL_FAILURE)
  }
  if (data.ok) return data.value
  throw declaredError(errors, data.error)
}

function applicationContext(
  context: RpcTransportContext,
  signal: AbortSignal | undefined,
): RpcRequestContext {
  return { ...context, signal: signal ?? new AbortController().signal }
}

export function createDaemonRouter(
  application: DaemonRpcApplication,
  expectations: DaemonRouterExpectations,
) {
  const daemonProtocol = rpcProtocolIdentitySchema.parse(expectations.protocol)
  const daemonRuntime = rpcRuntimeIdentitySchema.parse(expectations.runtime)
  const os = implement(daemonContract).$context<RpcTransportContext>()
  const compatibility = os.middleware(
    async ({ context, next, errors }, _input, _output) => {
      const parsedContext = rpcTransportContextSchema.safeParse(context)
      if (!parsedContext.success) {
        throw errors.ctxindex({ data: INTERNAL_FAILURE })
      }
      const requestContext = parsedContext.data
      if (
        requestContext.clientProtocol.id !== daemonProtocol.id ||
        requestContext.clientProtocol.version !== daemonProtocol.version
      ) {
        throw errors.protocol_incompatible({
          data: {
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
        throw errors.runtime_identity_mismatch({
          data: {
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

  return os.router({
    system: {
      health: os.system.health
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.system.health(
                input,
                applicationContext(context, signal),
              ),
            rpcHealthResultSchema,
            errors,
          ),
        ),
      shutdown: os.system.shutdown
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.system.shutdown(
                input,
                applicationContext(context, signal),
              ),
            rpcShutdownAcceptedSchema,
            errors,
          ),
        ),
    },
    realm: {
      add: os.realm.add
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.realm.add(input, applicationContext(context, signal)),
            rpcRealmAddResultSchema,
            errors,
          ),
        ),
      list: os.realm.list
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.realm.list(
                input,
                applicationContext(context, signal),
              ),
            rpcRealmListResultSchema,
            errors,
          ),
        ),
    },
    source: {
      definitions: os.source.definitions
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.source.definitions(
                input,
                applicationContext(context, signal),
              ),
            rpcSourceDefinitionsResultSchema,
            errors,
          ),
        ),
      add: os.source.add
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.source.add(
                input,
                applicationContext(context, signal),
              ),
            rpcSourceAddResultSchema,
            errors,
          ),
        ),
      list: os.source.list
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.source.list(
                input,
                applicationContext(context, signal),
              ),
            rpcSourceListResultSchema,
            errors,
          ),
        ),
      remove: os.source.remove
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.source.remove(
                input,
                applicationContext(context, signal),
              ),
            rpcSourceRemoveResultSchema,
            errors,
          ),
        ),
    },
    sync: {
      run: os.sync.run
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.sync.run(input, applicationContext(context, signal)),
            rpcSyncResultSchema,
            errors,
          ),
        ),
    },
    status: {
      get: os.status.get
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.status.get(
                input,
                applicationContext(context, signal),
              ),
            rpcStatusResultSchema,
            errors,
          ),
        ),
    },
    search: {
      query: os.search.query
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.search.query(
                input,
                applicationContext(context, signal),
              ),
            rpcSearchResultSchema,
            errors,
          ),
        ),
    },
    resource: {
      get: os.resource.get
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.resource.get(
                input,
                applicationContext(context, signal),
              ),
            rpcResourceGetResultSchema,
            errors,
          ),
        ),
    },
    thread: {
      get: os.thread.get
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.thread.get(
                input,
                applicationContext(context, signal),
              ),
            rpcThreadGetResultSchema,
            errors,
          ),
        ),
    },
  })
}

export type DaemonRouter = ReturnType<typeof createDaemonRouter>
