import { expect, test } from 'bun:test'

test('RPC contract derivation has no handwritten application or error mapping boundary', async () => {
  const source = (name: string) => Bun.file(`packages/rpc/src/${name}`).text()
  const [contract, router, schemas] = await Promise.all([
    source('contract.ts'),
    source('router.ts'),
    source('schemas.ts'),
  ])

  expect(contract).toContain('oc.errors(rpcFailureRegistry)')
  expect(contract).not.toContain('rpcErrorDefinitions')
  expect(contract).not.toContain('rpcFailureErrorCode')
  expect(router).toContain('InferContractRouterInputs<typeof daemonContract>')
  expect(router).toContain('InferContractRouterOutputs<typeof daemonContract>')
  expect(router).not.toContain('export interface DaemonRpcApplication')
  expect(router).not.toContain('switch (failure.kind)')
  expect(schemas).toContain('export const rpcFailureRegistry =')
})
