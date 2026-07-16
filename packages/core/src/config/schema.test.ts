import { expect, test } from 'bun:test'
import { configSchema } from './schema'

test('configuration without an Extensions section defaults to no trusted paths', () => {
  const config = configSchema.parse({
    secrets: { backend: 'keychain' },
    log: { file: {} },
  })

  expect(config.extensions.paths).toEqual([])
})

test('removed secret passphrase config is rejected rather than ignored', () => {
  const result = configSchema.safeParse({
    secrets: {
      backend: 'file',
      passphrase_env: 'env://LEGACY_SECRET',
    },
    log: { file: {} },
  })

  expect(result.success).toBe(false)
})
