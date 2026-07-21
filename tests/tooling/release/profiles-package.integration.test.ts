import { expect, test } from 'bun:test'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packExtensionSdkPackage } from '../../../scripts/release/extension-sdk-package'
import {
  packProfilesPackage,
  readProfilesPackageFiles,
  verifyProfilesPackage,
} from '../../../scripts/release/profiles-package'

test('packs and verifies Profiles through a clean external install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-profiles-package-test-'))
  try {
    await packExtensionSdkPackage(root)
    const archive = await packProfilesPackage(root)
    const checksum = await verifyProfilesPackage(archive, true)
    const paths = (await readProfilesPackageFiles(archive))
      .map(({ path }) => path)
      .sort()

    for (const name of [
      'index',
      'calendar-event',
      'chat-message',
      'mail-message',
      'file',
    ]) {
      expect(paths).toContain(`package/dist/${name}.js`)
      expect(paths).toContain(`package/dist/${name}.d.ts`)
    }
    expect(paths.some((path) => path.includes('/src/'))).toBe(false)
    expect(checksum).toMatch(
      /^[a-f0-9]{64} {2}ctxindex-profiles-0\.1\.0\.tgz\n$/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

test('rejects a mismatched sibling SDK artifact before consumer install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-profiles-sdk-test-'))
  try {
    const sdkArchive = await packExtensionSdkPackage(root)
    const profilesArchive = await packProfilesPackage(root)
    await copyFile(profilesArchive, sdkArchive)

    await expect(verifyProfilesPackage(profilesArchive, true)).rejects.toThrow(
      'Unexpected Extension SDK package file',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
