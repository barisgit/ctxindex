import { expect, test } from 'bun:test'
import { parseDaemonRequestContext } from './transport'

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
