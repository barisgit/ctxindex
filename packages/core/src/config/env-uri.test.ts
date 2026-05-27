import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CtxindexConfigError } from '../errors'
import {
  assertSecretUri,
  getEnv,
  resetEnvForTests,
  resolveEnvUri,
} from './index'
import { readConfig } from './io'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
  resetEnvForTests()
})

test('env:// resolves through getEnv', () => {
  process.env.FOO = 'bar'
  resetEnvForTests()

  expect(resolveEnvUri('env://FOO')).toBe('bar')
})

test('env: resolves through getEnv', () => {
  process.env.FOO = 'bar'
  resetEnvForTests()

  expect(resolveEnvUri('env:FOO')).toBe('bar')
})

test('getEnv memoized and frozen', () => {
  process.env.UNRELATED_ENV_PASSTHROUGH = 'preserved'
  resetEnvForTests()

  const env = getEnv()

  expect(getEnv()).toBe(env)
  expect(Object.isFrozen(env)).toBe(true)
  expect(env.UNRELATED_ENV_PASSTHROUGH).toBe('preserved')
})

test('resetEnvForTests invalidates memoized env', () => {
  process.env.RESETTABLE_ENV_VALUE = 'before'
  resetEnvForTests()

  expect(getEnv().RESETTABLE_ENV_VALUE).toBe('before')
  process.env.RESETTABLE_ENV_VALUE = 'after'
  expect(getEnv().RESETTABLE_ENV_VALUE).toBe('before')

  resetEnvForTests()
  expect(getEnv().RESETTABLE_ENV_VALUE).toBe('after')
})

test('lowercase rejected', () => {
  expect(() => resolveEnvUri('env://lowercase')).toThrow(CtxindexConfigError)
  expect(() => resolveEnvUri('env://lowercase')).toThrow('invalid secret URI')
})

test('unset env var does not leak value', () => {
  process.env.SECRET_LEAK_CANARY = 'secret-leak-canary'
  delete process.env.MISSING_SECRET
  resetEnvForTests()

  let thrown: unknown
  try {
    resolveEnvUri('env://MISSING_SECRET')
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(CtxindexConfigError)
  expect(thrown).toMatchObject({ code: 'env_var_unset' })
  expect(String((thrown as Error).message)).toContain('MISSING_SECRET')
  expect(String((thrown as Error).message)).not.toContain('secret-leak-canary')
})

test('bare string rejected', async () => {
  expect(() => assertSecretUri('plaintext', 'secrets.passphrase_env')).toThrow(
    CtxindexConfigError,
  )
  expect(() => assertSecretUri('plaintext', 'secrets.passphrase_env')).toThrow(
    'must be a URI',
  )

  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-env-uri-'))
  const configPath = join(sandbox, 'config.toml')
  await writeFile(
    configPath,
    `
[secrets]
backend = "file"
passphrase_env = "plaintext"

[log]
level = "info"

[log.file]
rotate = "daily"
retain_days = 14
compress = true
`,
  )

  try {
    await expect(readConfig(configPath)).rejects.toMatchObject({
      code: 'secret_must_be_uri',
    })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
})

test('invalid prefix rejected', () => {
  expect(() => resolveEnvUri('env:///FOO')).toThrow(CtxindexConfigError)
  expect(() => resolveEnvUri('dotenv://FOO')).toThrow(CtxindexConfigError)
  expect(() => resolveEnvUri('dotenv://FOO')).toThrow('invalid secret URI')
})
