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
  rpcAccountAddEventSchema,
  rpcAccountAddResultSchema,
  rpcAccountListResultSchema,
  rpcAccountRemoveResultSchema,
  rpcAccountRespondResultSchema,
  rpcActionDescribeResultSchema,
  rpcActionRunResultSchema,
  rpcDocumentationGetResultSchema,
  rpcDocumentationListResultSchema,
  rpcDocumentationSearchResultSchema,
  rpcExportResultSchema,
  type rpcFailureRegistry,
  rpcFailureSchema,
  rpcHealthResultSchema,
  rpcOAuthAppAddResultSchema,
  rpcOAuthAppListResultSchema,
  rpcOAuthAppRegistrationResultSchema,
  rpcOAuthAppRemoveResultSchema,
  rpcProtocolIdentitySchema,
  rpcRealmAddResultSchema,
  rpcRealmListResultSchema,
  rpcResourceGetResultSchema,
  rpcResultSchema,
  rpcRuntimeIdentitySchema,
  rpcSearchResultSchema,
  rpcSecretsBackendSetResultSchema,
  rpcSecretsStatusResultSchema,
  rpcShutdownAcceptedSchema,
  rpcSourceAddResultSchema,
  rpcSourceDefinitionsResultSchema,
  rpcSourceListResultSchema,
  rpcSourceRemoveResultSchema,
  rpcStatusResultSchema,
  rpcSyncEventSchema,
  rpcSyncResultSchema,
  rpcThreadGetResultSchema,
  rpcTransportContextSchema,
} from './schemas'

export type { DaemonClient } from './contract'
export type { RpcRequestContext, RpcTransportContext } from './schemas'

type ContractApplication<Contract, Input, Output> =
  Contract extends AnyContractProcedure
    ? (
        input: Input,
        context: RpcRequestContext,
      ) => Promise<RpcResult<ApplicationOutput<Output>>>
    : {
        [Key in keyof Contract]: Key extends keyof Input
          ? Key extends keyof Output
            ? ContractApplication<Contract[Key], Input[Key], Output[Key]>
            : never
          : never
      }

type ApplicationOutput<Output> =
  Output extends AsyncIterator<infer Yield, infer Return, infer Next>
    ? AsyncIteratorObject<Yield, RpcResult<Return>, Next>
    : Output

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

function isAsyncIterator(
  value: unknown,
): value is AsyncIteratorObject<unknown> {
  try {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { next?: unknown }).next === 'function' &&
      typeof (value as { [Symbol.asyncIterator]?: unknown })[
        Symbol.asyncIterator
      ] === 'function'
    )
  } catch {
    return false
  }
}

async function invokeStreamApplication<Yield, Return>(
  invoke: () => Promise<
    RpcResult<AsyncIteratorObject<Yield, RpcResult<Return>, void>>
  >,
  yieldSchema: z.ZodType<Yield>,
  returnSchema: z.ZodType<Return>,
  errors: FailureErrorFactories,
): Promise<AsyncIteratorObject<Yield, Return, void>> {
  let iterator: AsyncIteratorObject<Yield, RpcResult<Return>, void> | undefined
  let applicationResult: unknown
  try {
    applicationResult = await invoke()
  } catch {
    throw declaredError(errors, INTERNAL_FAILURE)
  }

  let failure: RpcFailure | undefined
  try {
    if (
      typeof applicationResult !== 'object' ||
      applicationResult === null ||
      !('ok' in applicationResult)
    ) {
      throw new TypeError('Invalid application result')
    }
    if (applicationResult.ok === false) {
      if (!('error' in applicationResult))
        throw new TypeError('Missing failure')
      const parsedFailure = rpcFailureSchema.safeParse(applicationResult.error)
      if (!parsedFailure.success) throw new TypeError('Invalid failure')
      failure = parsedFailure.data
    } else if (
      applicationResult.ok === true &&
      'value' in applicationResult &&
      isAsyncIterator(applicationResult.value)
    ) {
      iterator = applicationResult.value as AsyncIteratorObject<
        Yield,
        RpcResult<Return>,
        void
      >
    } else {
      throw new TypeError('Invalid application stream')
    }
  } catch {
    throw declaredError(errors, INTERNAL_FAILURE)
  }
  if (failure) throw declaredError(errors, failure)
  if (!iterator) throw declaredError(errors, INTERNAL_FAILURE)

  let completed = false
  const close = async (): Promise<void> => {
    if (completed) return
    completed = true
    try {
      await iterator.return?.()
    } catch {}
  }
  const output: AsyncIteratorObject<Yield, Return, void> = {
    [Symbol.asyncIterator]() {
      return output
    },
    async [Symbol.asyncDispose]() {
      await close()
    },
    async next() {
      let step: IteratorResult<Yield, RpcResult<Return>>
      try {
        step = await iterator.next()
      } catch {
        await close()
        throw declaredError(errors, INTERNAL_FAILURE)
      }
      if (!step.done) {
        const event = yieldSchema.safeParse(step.value)
        if (!event.success) {
          await close()
          throw declaredError(errors, INTERNAL_FAILURE)
        }
        return { done: false, value: event.data }
      }
      completed = true
      const terminal = rpcResultSchema(returnSchema).safeParse(step.value)
      if (!terminal.success) throw declaredError(errors, INTERNAL_FAILURE)
      if (terminal.data.ok) return { done: true, value: terminal.data.value }
      throw declaredError(errors, terminal.data.error)
    },
    async return(value) {
      await close()
      return {
        done: true,
        value: value === undefined ? (undefined as Return) : await value,
      }
    },
    async throw(error) {
      await close()
      throw error
    },
  }
  return output
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
    secrets: {
      status: os.secrets.status
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.secrets.status(
                input,
                applicationContext(context, signal),
              ),
            rpcSecretsStatusResultSchema,
            errors,
          ),
        ),
      backend: {
        set: os.secrets.backend.set
          .use(compatibility)
          .handler(({ input, context, signal, errors }) =>
            invokeApplication(
              () =>
                application.secrets.backend.set(
                  input,
                  applicationContext(context, signal),
                ),
              rpcSecretsBackendSetResultSchema,
              errors,
            ),
          ),
      },
    },
    account: {
      add: os.account.add
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeStreamApplication(
            () =>
              application.account.add(
                input,
                applicationContext(context, signal),
              ),
            rpcAccountAddEventSchema,
            rpcAccountAddResultSchema,
            errors,
          ),
        ),
      respond: os.account.respond
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.account.respond(
                input,
                applicationContext(context, signal),
              ),
            rpcAccountRespondResultSchema,
            errors,
          ),
        ),
      list: os.account.list
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.account.list(
                input,
                applicationContext(context, signal),
              ),
            rpcAccountListResultSchema,
            errors,
          ),
        ),
      remove: os.account.remove
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.account.remove(
                input,
                applicationContext(context, signal),
              ),
            rpcAccountRemoveResultSchema,
            errors,
          ),
        ),
    },
    oauthApp: {
      registration: os.oauthApp.registration
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.oauthApp.registration(
                input,
                applicationContext(context, signal),
              ),
            rpcOAuthAppRegistrationResultSchema,
            errors,
          ),
        ),
      add: os.oauthApp.add
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.oauthApp.add(
                input,
                applicationContext(context, signal),
              ),
            rpcOAuthAppAddResultSchema,
            errors,
          ),
        ),
      list: os.oauthApp.list
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.oauthApp.list(
                input,
                applicationContext(context, signal),
              ),
            rpcOAuthAppListResultSchema,
            errors,
          ),
        ),
      remove: os.oauthApp.remove
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.oauthApp.remove(
                input,
                applicationContext(context, signal),
              ),
            rpcOAuthAppRemoveResultSchema,
            errors,
          ),
        ),
    },
    documentation: {
      list: os.documentation.list
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.documentation.list(
                input,
                applicationContext(context, signal),
              ),
            rpcDocumentationListResultSchema,
            errors,
          ),
        ),
      get: os.documentation.get
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.documentation.get(
                input,
                applicationContext(context, signal),
              ),
            rpcDocumentationGetResultSchema,
            errors,
          ),
        ),
      search: os.documentation.search
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.documentation.search(
                input,
                applicationContext(context, signal),
              ),
            rpcDocumentationSearchResultSchema,
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
          invokeStreamApplication(
            () =>
              application.sync.run(input, applicationContext(context, signal)),
            rpcSyncEventSchema,
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
    export: {
      prepare: os.export.prepare
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.export.prepare(
                input,
                applicationContext(context, signal),
              ),
            rpcExportResultSchema,
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
    action: {
      describe: os.action.describe
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.action.describe(
                input,
                applicationContext(context, signal),
              ),
            rpcActionDescribeResultSchema,
            errors,
          ),
        ),
      run: os.action.run
        .use(compatibility)
        .handler(({ input, context, signal, errors }) =>
          invokeApplication(
            () =>
              application.action.run(
                input,
                applicationContext(context, signal),
              ),
            rpcActionRunResultSchema,
            errors,
          ),
        ),
    },
  })
}

export type DaemonRouter = ReturnType<typeof createDaemonRouter>
