import { expect, test } from 'bun:test'
import { exists } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

test('mixed provider selection fails before network, secrets, or database creation', async () => {
  let calls = 0
  const server = createServer((_request, response) => {
    calls++
    response.writeHead(500)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(
      [
        'auth',
        'add',
        'google',
        '--adapter',
        'google.mailbox',
        '--adapter',
        'local.directory',
        '--from-env',
      ],
      {
        env: {
          NODE_ENV: 'test',
          CTXINDEX_OAUTH_MOCK_BASE_URL: base,
          CTXINDEX_GOOGLE_CLIENT_ID: 'id',
          CTXINDEX_GOOGLE_REFRESH_TOKEN: 'refresh',
          CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox.dir, 'keytar.json'),
        },
      },
    )
    expect(result.exitCode).toBe(2)
    expect(calls).toBe(0)
    expect(
      await exists(join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')),
    ).toBe(false)
    expect(await exists(join(sandbox.dir, 'keytar.json'))).toBe(false)
  } finally {
    await sandbox.cleanup()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
