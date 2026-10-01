import { expect, test } from 'bun:test'
import { DAEMON_PROTOCOL } from './runtime'
import { ByteTransferStore } from './transfer'
import { parseDaemonRequestContext, serveByteTransfer } from './transport'

const digest = 'a'.repeat(64)
const runtime = {
  tupleDigest: digest,
  configDigest: digest,
  dataDigest: digest,
  stateDigest: digest,
  cacheDigest: digest,
  databaseDigest: digest,
}

test('transport preserves a presented incompatible protocol for router middleware', () => {
  const request = new Request('http://daemon/rpc/system/health', {
    headers: {
      'x-ctxindex-protocol-id': 'incompatible.client',
      'x-ctxindex-protocol-version': '2',
      'x-ctxindex-runtime': JSON.stringify(runtime),
    },
  })
  const context = parseDaemonRequestContext(request)
  expect(context.clientProtocol).toEqual({
    id: 'incompatible.client',
    version: 2,
  })
  expect(context).not.toHaveProperty('signal')
})

test('transport rejects absent runtime metadata before dispatch', () => {
  const request = new Request('http://daemon/rpc/system/health', {
    headers: {
      'x-ctxindex-protocol-id': 'ctxindex.local',
      'x-ctxindex-protocol-version': '2',
    },
  })
  expect(() => parseDaemonRequestContext(request)).toThrow(
    'Missing or oversized runtime identity',
  )
})

test('transport serves an exact transfer ticket once without accepting path variants', async () => {
  const store = new ByteTransferStore({
    randomBytes: () => new Uint8Array(32).fill(1),
  })
  const transfer = store.create(Uint8Array.of(0, 255, 1))
  const request = new Request(`http://daemon/transfer/${transfer.ticket}`, {
    method: 'GET',
  })
  const first = serveByteTransfer(request, compatible, expectations, store)
  expect(first?.status).toBe(200)
  expect(new Uint8Array(await (first as Response).arrayBuffer())).toEqual(
    Uint8Array.of(0, 255, 1),
  )
  expect(
    serveByteTransfer(request, compatible, expectations, store)?.status,
  ).toBe(404)
  expect(
    serveByteTransfer(
      new Request(`http://daemon/transfer/${transfer.ticket}/extra`),
      compatible,
      expectations,
      store,
    )?.status,
  ).toBe(404)
})

const expectations = { protocol: DAEMON_PROTOCOL, runtime }
const compatible = {
  requestId: 'transfer-request',
  clientProtocol: DAEMON_PROTOCOL,
  clientRuntime: runtime,
}

test('transport rejects incompatible transfer GETs before consuming the ticket', async () => {
  const store = new ByteTransferStore()
  const transfer = store.create(Uint8Array.of(7))
  const request = new Request(`http://daemon/transfer/${transfer.ticket}`)
  const incompatible = [
    {
      context: {
        ...compatible,
        clientProtocol: { id: DAEMON_PROTOCOL.id, version: 999 },
      },
      kind: 'protocol_incompatible',
    },
    {
      context: {
        ...compatible,
        clientRuntime: { ...runtime, tupleDigest: 'b'.repeat(64) },
      },
      kind: 'runtime_identity_mismatch',
    },
  ]

  for (const { context, kind } of incompatible) {
    const response = serveByteTransfer(request, context, expectations, store)
    expect(response?.status).toBe(409)
    expect(await (response as Response).json()).toMatchObject({
      kind,
      code: kind,
    })
  }

  const admitted = serveByteTransfer(request, compatible, expectations, store)
  expect(admitted?.status).toBe(200)
  expect(new Uint8Array(await (admitted as Response).arrayBuffer())).toEqual(
    Uint8Array.of(7),
  )
})
