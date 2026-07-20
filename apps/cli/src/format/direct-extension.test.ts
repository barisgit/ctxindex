import { expect, test } from 'bun:test'
import {
  formatDirectExtension,
  formatDirectExtensionUninstall,
} from './direct-extension'

const extension = {
  id: 'example.direct',
  sourceKind: 'npm' as const,
  requestedTarget: '@example/direct@^1',
  resolvedIdentity: '1.2.3',
  materializationDigest: 'a'.repeat(64),
  installedAt: 100,
  updatedAt: 200,
}

test('direct lifecycle text includes immutable provenance and both timestamps', () => {
  expect(formatDirectExtension('Updated', extension, false)).toContain(
    'Installed: 100\tUpdated: 200',
  )
})

test('forced uninstall states data preservation and unavailable Sources', () => {
  const result = {
    extension,
    forced: true,
    dataPreserved: true as const,
    blockingSources: [
      { id: 'source-1', label: 'mail', adapterId: 'example.mail' },
    ],
  }
  expect(formatDirectExtensionUninstall(result, false)).toContain(
    'Sources and materialized data preserved\tAffected Sources unavailable: mail',
  )
  expect(
    JSON.parse(formatDirectExtensionUninstall(result, true)),
  ).toMatchObject({ forced: true, dataPreserved: true })
})
