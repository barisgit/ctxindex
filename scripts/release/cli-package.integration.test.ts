import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packCliPackage, smokeCliPackage } from './cli-package'

test('the exact packed CLI installs globally and runs outside the checkout', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-package-smoke-test-'))
  try {
    const archive = await packCliPackage(join(sandbox, 'artifacts'))
    const result = await smokeCliPackage(archive, join(sandbox, 'smoke'))
    expect(['loaded', 'host-libsecret-unavailable']).toContain(
      result.nativeKeytar,
    )
    if (process.platform !== 'linux') {
      expect(result.nativeKeytar).toBe('loaded')
    }
    expect(result).toEqual(
      expect.objectContaining({
        archive,
        packageName: 'ctxindex',
        oauthAppHelpLoaded: true,
        preInitStatePreserved: true,
        packageExtensionLoaded: true,
      }),
    )
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}, 60_000)
