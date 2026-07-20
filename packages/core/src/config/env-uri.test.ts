import { afterEach, expect, test } from 'bun:test'
import { CtxindexConfigError } from '../errors'
import {
  assertSecretUri,
  getEnv,
  readEnvironmentVariable,
  resetEnvForTests,
  resolveEnvUri,
} from './index'

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

test('central environment reads accept every safe variable name', () => {
  process.env.GOOGLE_CLIENT_ID = 'public-client'
  process.env._PRIVATE_CLIENT_ID = 'private-client'
  process.env['1INVALID_CLIENT_ID'] = 'invalid-client'
  resetEnvForTests()

  expect(readEnvironmentVariable('GOOGLE_CLIENT_ID')).toBe('public-client')
  expect(readEnvironmentVariable('_PRIVATE_CLIENT_ID')).toBe('private-client')
  expect(readEnvironmentVariable('1INVALID_CLIENT_ID')).toBeUndefined()
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

test('bare string rejected', () => {
  expect(() => assertSecretUri('plaintext', 'secrets.passphrase_env')).toThrow(
    CtxindexConfigError,
  )
  expect(() => assertSecretUri('plaintext', 'secrets.passphrase_env')).toThrow(
    'must be a URI',
  )
})

test('invalid prefix rejected', () => {
  expect(() => resolveEnvUri('env:///FOO')).toThrow(CtxindexConfigError)
  expect(() => resolveEnvUri('dotenv://FOO')).toThrow(CtxindexConfigError)
  expect(() => resolveEnvUri('dotenv://FOO')).toThrow('invalid secret URI')
})
