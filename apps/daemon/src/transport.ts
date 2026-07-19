import { randomUUID } from 'node:crypto'
import {
  createDaemonRouter,
  type DaemonRouterExpectations,
  type DaemonRpcApplication,
  rpcPresentedProtocolIdentitySchema,
  rpcRuntimeIdentitySchema,
} from '@ctxindex/rpc'
import { RPCHandler } from '@orpc/server/fetch'

export interface DaemonListener {
  stop(): void | Promise<void>
}

export interface BindDaemonTransportInput {
  readonly endpoint: string
  readonly application: DaemonRpcApplication
  readonly expectations: DaemonRouterExpectations
}

export function parseDaemonRequestContext(request: Request) {
  const protocol = rpcPresentedProtocolIdentitySchema.parse({
    id: request.headers.get('x-ctxindex-protocol-id'),
    version: Number(request.headers.get('x-ctxindex-protocol-version')),
  })
  const serializedRuntime = request.headers.get('x-ctxindex-runtime')
  if (
    serializedRuntime === null ||
    Buffer.byteLength(serializedRuntime, 'utf8') > 1_024
  ) {
    throw new TypeError('Missing or oversized runtime identity')
  }
  const runtime = rpcRuntimeIdentitySchema.parse(
    JSON.parse(serializedRuntime) as unknown,
  )
  return {
    requestId: randomUUID(),
    signal: request.signal,
    clientProtocol: protocol,
    clientRuntime: runtime,
  }
}

export function bindDaemonTransport(
  input: BindDaemonTransportInput,
): DaemonListener {
  const handler = new RPCHandler(
    createDaemonRouter(input.application, input.expectations),
  )
  const server = Bun.serve({
    unix: input.endpoint,
    async fetch(request) {
      let context: ReturnType<typeof parseDaemonRequestContext>
      try {
        context = parseDaemonRequestContext(request)
      } catch {
        return new Response('Invalid daemon request.', { status: 400 })
      }
      const result = await handler.handle(request, { prefix: '/rpc', context })
      return result.matched
        ? result.response
        : new Response('Not found.', { status: 404 })
    },
  })
  return { stop: () => server.stop() }
}
