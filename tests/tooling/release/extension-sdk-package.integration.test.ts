import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  packExtensionSdkPackage,
  readExtensionSdkPackageFiles,
  verifyExtensionSdkPackage,
} from '../../../scripts/release/extension-sdk-package'

test('packs and verifies the exact SDK artifact through a clean external install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-sdk-package-test-'))
  try {
    const archive = await packExtensionSdkPackage(root)
    const checksum = await verifyExtensionSdkPackage(archive, true)
    const paths = (await readExtensionSdkPackageFiles(archive))
      .map(({ path }) => path)
      .sort()

    expect(paths).toContain('package/dist/index.js')
    expect(paths).toContain('package/dist/index.d.ts')
    expect(paths.some((path) => path.includes('/src/'))).toBe(false)
    expect(checksum).toMatch(
      /^[a-f0-9]{64} {2}ctxindex-extension-sdk-0\.1\.1\.tgz\n$/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
