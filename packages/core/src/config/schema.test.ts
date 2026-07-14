import { expect, test } from 'bun:test'
import { configSchema } from './schema'

test('configuration without an Extensions section defaults to no trusted paths', () => {
  const config = configSchema.parse({
    secrets: { backend: 'keychain' },
    log: { file: {} },
  })

  expect(config.extensions.paths).toEqual([])
})
