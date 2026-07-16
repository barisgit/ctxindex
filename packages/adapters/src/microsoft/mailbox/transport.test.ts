import { afterEach, expect, test } from 'bun:test'
import { resetEnvForTests } from '@ctxindex/core/config'
import { graphUrl, validateGraphNextLink } from './transport'

const originalNodeEnv = process.env.NODE_ENV
const originalMockBase = process.env.CTXINDEX_GRAPH_MOCK_BASE_URL

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  if (originalMockBase === undefined)
    delete process.env.CTXINDEX_GRAPH_MOCK_BASE_URL
  else process.env.CTXINDEX_GRAPH_MOCK_BASE_URL = originalMockBase
  resetEnvForTests()
})

test('Graph transport uses only a non-production loopback mock origin', () => {
  process.env.NODE_ENV = 'test'
  process.env.CTXINDEX_GRAPH_MOCK_BASE_URL = 'http://127.0.0.1:43123'
  resetEnvForTests()

  expect(graphUrl('/me/messages')).toBe(
    'http://127.0.0.1:43123/v1.0/me/messages',
  )
  expect(
    validateGraphNextLink(
      'http://127.0.0.1:43123/v1.0/me/messages?$skiptoken=next',
      '/v1.0/me/messages',
    ),
  ).toBe('http://127.0.0.1:43123/v1.0/me/messages?$skiptoken=next')

  process.env.CTXINDEX_GRAPH_MOCK_BASE_URL = 'https://example.test'
  resetEnvForTests()
  expect(() => graphUrl('/me/messages')).toThrow(
    'mock base URL must be an origin on 127.0.0.1',
  )
})

test('Graph transport ignores the mock in production and bounds nextLink', () => {
  process.env.NODE_ENV = 'production'
  process.env.CTXINDEX_GRAPH_MOCK_BASE_URL = 'http://127.0.0.1:43123'
  resetEnvForTests()

  expect(graphUrl('/me/messages')).toBe(
    'https://graph.microsoft.com/v1.0/me/messages',
  )
  expect(() =>
    validateGraphNextLink(
      'https://evil.example/v1.0/me/messages?$skiptoken=next',
      '/v1.0/me/messages',
    ),
  ).toThrow('disallowed nextLink')
})
