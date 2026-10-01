import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createDocumentationService } from '@ctxindex/core/documentation'
import { resolveRuntimeIdentity } from '@ctxindex/local-daemon'
import {
  CLI_DAEMON_PROTOCOL,
  daemonHealth,
  selectDaemonForRuntime,
} from '../../../apps/cli/src/daemon/client'
import { DaemonApplication } from '../../../apps/daemon/src/application'
import { DAEMON_PROTOCOL } from '../../../apps/daemon/src/runtime'
import { ByteTransferStore } from '../../../apps/daemon/src/transfer'
import { bindDaemonTransport } from '../../../apps/daemon/src/transport'

test('registry-read clients reject the older daemon protocol before reusing its runtime', async () => {
  const root = await mkdtemp('/tmp/ctxi-protocol-')
  const runtime = resolveRuntimeIdentity({
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'data'),
    stateRoot: join(root, 'state'),
    cacheRoot: join(root, 'cache'),
  })
  const endpoint = join(root, 'daemon.sock')
  // Version 2 predates registry.describe and extension.list. A health-only
  // compatibility check must not accept it for clients needing those reads.
  const protocol = { id: 'ctxindex.local', version: 2 } as const
  const application = new DaemonApplication({
    protocol,
    runtime: runtime.identity,
    daemonVersion: '0.0.0',
    buildVersion: 'old-protocol-fixture',
    instanceId: 'old-daemon',
    startedAt: '2026-07-18T00:00:00.000Z',
    pid: process.pid,
    extensionDiagnostics: [],
    documentationService: createDocumentationService([]),
    observationTimeoutMs: 25,
    syncService: {
      run: async () => ({ mode: 'sync', results: [], warnings: [] }),
    },
    sourceService: { resolveSourceId: (value) => value, getStatus: () => [] },
  })
  application.markReady()
  const listener = bindDaemonTransport({
    endpoint,
    application,
    expectations: { protocol, runtime: runtime.identity },
    transferStore: new ByteTransferStore(),
  })
  try {
    const selection = selectDaemonForRuntime(runtime, {
      testEndpoint: endpoint,
    })
    if (!selection) throw new Error('Expected explicit test endpoint')
    await expect(daemonHealth(selection)).rejects.toMatchObject({
      code: 'protocol_incompatible',
    })
    expect(CLI_DAEMON_PROTOCOL).toEqual(DAEMON_PROTOCOL)
  } finally {
    await listener.stop()
    await rm(root, { recursive: true, force: true })
  }
})
