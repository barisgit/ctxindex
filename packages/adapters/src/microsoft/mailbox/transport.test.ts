import { afterEach, expect, test } from 'bun:test'
import { resetEnvForTests } from '@ctxindex/core/config'
import {
  graphResponseError,
  graphUrl,
  validateGraphNextLink,
} from './transport'

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

test('Graph transport reports fixed diagnostics without private provider values', async () => {
  const privateRequestId = 'private-request-identifier'
  const privateClientRequestId = 'private-client-request-identifier'
  const privateProviderText = 'private-provider-detail'
  const error = await graphResponseError(
    new Response(
      JSON.stringify({
        error: {
          code: 'BadRequest',
          message:
            "Parsing OData Select and Expand failed: Term '@odata.type' is not valid in a $select or $expand expression. " +
            privateProviderText,
          innerError: {
            'request-id': privateRequestId,
            'client-request-id': privateClientRequestId,
          },
        },
      }),
      { status: 400 },
    ),
  )

  expect(error).toMatchObject({ code: 'provider_bad_response' })
  expect(error.message).toBe(
    'Microsoft Graph request failed with status 400 (code BadRequest; Microsoft Graph rejected @odata.type in a $select or $expand expression; request-id [redacted]; client-request-id [redacted])',
  )
  expect(error.message).not.toContain(privateRequestId)
  expect(error.message).not.toContain(privateClientRequestId)
  expect(error.message).not.toContain(privateProviderText)
})

test('Graph transport withholds unknown or malformed provider wording', async () => {
  const privateProviderText = 'Confidential mailbox detail'
  const structured = await graphResponseError(
    new Response(
      JSON.stringify({
        error: {
          code: 'ProviderFailure',
          message: privateProviderText,
        },
      }),
      { status: 403, headers: { 'request-id': 'private-response-id' } },
    ),
  )
  expect(structured).toMatchObject({ code: 'permission_denied' })
  expect(structured.message).toBe(
    'Microsoft Graph request failed with status 403 (code ProviderFailure; provider message withheld; request-id [redacted])',
  )
  expect(structured.message).not.toContain(privateProviderText)

  const malformed = await graphResponseError(
    new Response('not-json', {
      status: 503,
      headers: { 'client-request-id': 'private-client-response-id' },
    }),
  )
  expect(malformed).toMatchObject({ code: 'provider_unavailable' })
  expect(malformed.message).toBe(
    'Microsoft Graph request failed with status 503 (client-request-id [redacted])',
  )

  const unreadable = await graphResponseError(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('private stream failure'))
        },
      }),
      { status: 502 },
    ),
  )
  expect(unreadable).toMatchObject({ code: 'provider_unavailable' })
  expect(unreadable.message).toBe(
    'Microsoft Graph request failed with status 502',
  )
})

test('Graph transport preserves status and retry classification', async () => {
  for (const [status, code] of [
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [404, 'not_found'],
    [500, 'provider_unavailable'],
    [400, 'provider_bad_response'],
  ] as const)
    expect(
      await graphResponseError(new Response('{}', { status })),
    ).toMatchObject({ code })

  expect(
    await graphResponseError(
      new Response('{}', {
        status: 429,
        headers: { 'x-ms-retry-after-ms': '2500' },
      }),
    ),
  ).toMatchObject({ code: 'rate_limited', retryAfterMs: 2500 })
})
