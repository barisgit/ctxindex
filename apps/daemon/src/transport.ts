import { randomUUID } from 'node:crypto'
import {
  createDaemonRouter,
  type DaemonRouterExpectations,
  type DaemonRpcApplication,
  rpcPresentedProtocolIdentitySchema,
  rpcRuntimeIdentitySchema,
} from '@ctxindex/rpc'
import { RPCHandler } from '@orpc/server/fetch'
import type { ByteTransferConsumer } from './transfer'

export interface DaemonListener {
  stop(): void | Promise<void>
}

export interface BindDaemonTransportInput {
  readonly endpoint: string
  readonly application: DaemonRpcApplication
  readonly expectations: DaemonRouterExpectations
  readonly transferStore: ByteTransferConsumer
}

const TRANSFER_PATH = /^\/transfer\/([a-f0-9]{64})$/

export function serveByteTransfer(
  request: Request,
  store: ByteTransferConsumer,
): Response | null {
  const path = new URL(request.url).pathname
  if (!path.startsWith('/transfer/')) return null
  if (request.method !== 'GET')
    return new Response('Method not allowed.', { status: 405 })
  const match = TRANSFER_PATH.exec(path)
  if (!match) return new Response('Not found.', { status: 404 })
  const bytes = store.consume(match[1] as string)
  if (!bytes) return new Response('Not found.', { status: 404 })
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-length': String(bytes.byteLength),
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
    },
  })
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
      const transfer = serveByteTransfer(request, input.transferStore)
      if (transfer) return transfer
      const result = await handler.handle(request, { prefix: '/rpc', context })
      return result.matched
        ? result.response
        : new Response('Not found.', { status: 404 })
    },
  })
  return { stop: () => server.stop() }
}
