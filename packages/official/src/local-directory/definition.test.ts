import { expect, test } from 'bun:test'
import { fileProfile } from '@ctxindex/profiles'
import { localDirectoryAdapterDefinition } from './definition'

test('local.directory is providerless and imports the exact file Profile', () => {
  expect(localDirectoryAdapterDefinition).toMatchObject({
    id: 'local.directory',
    profiles: [fileProfile],
    routing: 'indexed',
    capabilities: ['sync'],
    actions: {},
  })
  expect(localDirectoryAdapterDefinition).not.toHaveProperty('version')
  expect(localDirectoryAdapterDefinition).not.toHaveProperty('provider')
  expect(localDirectoryAdapterDefinition).not.toHaveProperty('access')
  expect(localDirectoryAdapterDefinition).not.toHaveProperty('auth')
  expect(localDirectoryAdapterDefinition.profiles[0]).toBe(fileProfile)
})
