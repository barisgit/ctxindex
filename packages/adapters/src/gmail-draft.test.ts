import { describe, expect, test } from 'bun:test'
import { resetEnvForTests } from '@ctxindex/core/config'
import type { ActionContext } from '@ctxindex/extension-sdk'
import {
  communicationMessageDraftCreateInputSchema,
  communicationMessageDraftUpdateInputSchema,
} from '@ctxindex/profiles'
import { gmailAdapterDefinition } from './builtins'
import {
  buildGmailDraftRaw,
  gmailDraftCreate,
  gmailDraftUpdate,
} from './gmail-draft'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const signal = new AbortController().signal
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}

function context(
  input: unknown,
  mockedFetch: typeof fetch,
): ActionContext<never> {
  return {
    source: { id: sourceId, config: {} },
    input: input as never,
    signal,
    fetch: mockedFetch,
    logger,
  }
}

function decodeRaw(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8')
}

describe('buildGmailDraftRaw', () => {
  test('builds the deterministic RFC5322 text message and unpadded base64url', () => {
    const raw = buildGmailDraftRaw({
      to: ['one@example.com', 'two@example.com'],
      cc: ['copy@example.com'],
      bcc: [],
      subject: 'Project update',
      bodyText: 'line one\nline two',
    })

    expect(decodeRaw(raw)).toBe(
      [
        'To: one@example.com, two@example.com',
        'Cc: copy@example.com',
        'Subject: Project update',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'line one',
        'line two',
      ].join('\r\n'),
    )
    expect(raw).not.toContain('=')
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('RFC2047 B-encodes a non-ASCII Subject and emits optional recipients in fixed order', () => {
    const raw = buildGmailDraftRaw({
      to: ['recipient@example.com'],
      cc: [],
      bcc: ['blind@example.com'],
      subject: 'Pozdrav Živjo',
      bodyText: '',
    })

    expect(decodeRaw(raw)).toBe(
      [
        'To: recipient@example.com',
        'Bcc: blind@example.com',
        'Subject: =?UTF-8?B?UG96ZHJhdiDFvWl2am8=?=',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        '',
      ].join('\r\n'),
    )
  })

  test.each([
    {
      to: ['recipient@example.com\r\nBcc: injected@example.com'],
      subject: 'Safe',
      bodyText: '',
    },
    {
      to: ['recipient@example.com'],
      subject: 'Safe\r\nX-Injected: yes',
      bodyText: '',
    },
  ])('rejects malformed direct builder input before encoding', (input) => {
    expect(() => buildGmailDraftRaw(input as never)).toThrow(
      expect.objectContaining({ code: 'invalid_action_input' }),
    )
  })
})

describe('gmailDraftCreate', () => {
  test('is bound declaratively and performs one exact POST with a stable Draft Resource', async () => {
    const calls: { url: string; init?: Parameters<typeof fetch>[1] }[] = []
    const mockedFetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({ url: input.toString(), init })
      return new Response(
        JSON.stringify({
          id: 'draft/id 1',
          message: {
            id: 'message-1',
            threadId: 'thread-1',
            labelIds: ['DRAFT', 'UNREAD'],
          },
        }),
      )
    }) as unknown as typeof fetch
    const input = {
      to: ['to@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      subject: 'Subject',
      bodyText: 'Body',
    }

    const binding =
      gmailAdapterDefinition.actions['communication.message.draft.create']
    expect(binding?.profile).toEqual({
      id: 'communication.message',
      version: 1,
    })
    expect(binding?.output).toEqual({ id: 'communication.message', version: 1 })
    expect(binding?.input).toBe(communicationMessageDraftCreateInputSchema)
    const resource = await binding?.run(context(input, mockedFetch))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    )
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
    })
    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body).toEqual({ message: { raw: buildGmailDraftRaw(input) } })
    expect(resource).toEqual({
      ref: `ctx://${sourceId}/draft/draft%2Fid%201`,
      profile: { id: 'communication.message', version: 1 },
      title: 'Subject',
      payload: {
        providerDraftId: 'draft/id 1',
        providerMessageId: 'message-1',
        to: ['to@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        subject: 'Subject',
        bodyText: 'Body',
        threadId: 'thread-1',
        conversationKey: `${sourceId}:thread-1`,
        labels: ['DRAFT', 'UNREAD'],
        unread: true,
      },
    })
  })

  test('routes one Draft POST through the non-production loopback base', async () => {
    const previousMockBase = process.env.CTXINDEX_GMAIL_MOCK_BASE_URL
    const previousNodeEnv = process.env.NODE_ENV
    process.env.CTXINDEX_GMAIL_MOCK_BASE_URL =
      'http://127.0.0.1:4567/mock-base/'
    process.env.NODE_ENV = 'test'
    resetEnvForTests()
    const urls: string[] = []
    try {
      await gmailDraftCreate(
        context({ to: ['to@example.com'], subject: '', bodyText: '' }, (async (
          input: Parameters<typeof fetch>[0],
        ) => {
          urls.push(input.toString())
          return Response.json({
            id: 'draft-1',
            message: { id: 'message-1' },
          })
        }) as unknown as typeof fetch),
      )
    } finally {
      if (previousMockBase === undefined)
        delete process.env.CTXINDEX_GMAIL_MOCK_BASE_URL
      else process.env.CTXINDEX_GMAIL_MOCK_BASE_URL = previousMockBase
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      resetEnvForTests()
    }

    expect(urls).toEqual([
      'http://127.0.0.1:4567/mock-base/gmail/v1/users/me/drafts',
    ])
  })

  test('defensively rejects malformed direct input before fetch', async () => {
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        {
          to: ['to@example.com\r\nBcc: injected@example.com'],
          subject: '',
          bodyText: '',
        },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test.each([
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)('maps HTTP %i with one request', async (status, code) => {
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        { to: ['to@example.com'], subject: '', bodyText: '' },
        (async () => {
          fetchCalls += 1
          return new Response('{}', { status })
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code })
    expect(fetchCalls).toBe(1)
  })

  test.each([
    ['not-json', 'malformed JSON'],
    [JSON.stringify({ id: 'draft-1', message: {} }), 'invalid shape'],
  ])('maps %s response to provider_bad_response', async (body) => {
    let fetchCalls = 0
    const error = await gmailDraftCreate(
      context(
        { to: ['to@example.com'], subject: '', bodyText: '' },
        (async () => {
          fetchCalls += 1
          return new Response(body)
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
    expect(fetchCalls).toBe(1)
  })
})

describe('gmailDraftUpdate', () => {
  test('is bound declaratively and performs one exact PUT with complete replacement content', async () => {
    const calls: { url: string; init?: Parameters<typeof fetch>[1] }[] = []
    const mockedFetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      calls.push({ url: input.toString(), init })
      return Response.json({
        id: 'draft/id 1',
        message: {
          id: 'message-2',
          threadId: 'thread-2',
          labelIds: ['DRAFT', 'UNREAD'],
        },
      })
    }) as unknown as typeof fetch
    const input = {
      ref: `ctx://${sourceId}/draft/draft%2Fid%201`,
      to: ['replacement@example.com'],
      subject: 'Replacement',
      bodyText: 'Replacement body',
    }

    const binding =
      gmailAdapterDefinition.actions['communication.message.draft.update']
    expect(binding?.profile).toEqual({
      id: 'communication.message',
      version: 1,
    })
    expect(binding?.output).toEqual({ id: 'communication.message', version: 1 })
    expect(binding?.input).toBe(communicationMessageDraftUpdateInputSchema)
    const resource = await binding?.run(context(input, mockedFetch))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts/draft%2Fid%201',
    )
    expect(calls[0]?.init).toMatchObject({
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      signal,
    })
    const requestBody = JSON.parse(String(calls[0]?.init?.body)) as {
      message: { raw: string }
    }
    expect(requestBody).toEqual({
      message: {
        raw: buildGmailDraftRaw({
          to: input.to,
          subject: input.subject,
          bodyText: input.bodyText,
        }),
      },
    })
    expect(decodeRaw(requestBody.message.raw)).toBe(
      [
        'To: replacement@example.com',
        'Subject: Replacement',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'Replacement body',
      ].join('\r\n'),
    )
    expect(resource).toEqual({
      ref: input.ref,
      profile: { id: 'communication.message', version: 1 },
      title: 'Replacement',
      payload: {
        providerDraftId: 'draft/id 1',
        providerMessageId: 'message-2',
        to: ['replacement@example.com'],
        cc: [],
        bcc: [],
        subject: 'Replacement',
        bodyText: 'Replacement body',
        threadId: 'thread-2',
        conversationKey: `${sourceId}:thread-2`,
        labels: ['DRAFT', 'UNREAD'],
        unread: true,
      },
    })
  })

  test.each([
    [`ctx://01KXHBNECDAH1T4MJ38X88EPFK/draft/draft-1`, 'ref_source_mismatch'],
    [`ctx://${sourceId.toLowerCase()}/draft/draft-1`, 'invalid_ref'],
    [`ctx://${sourceId}/message/message-1`, 'action_unsupported'],
    [`ctx://${sourceId}/draft/draft-1?format=full`, 'invalid_ref'],
    [`ctx://${sourceId}/draft/draft-1/extra`, 'invalid_ref'],
    [`ctx://${sourceId}/draft/draft-1/`, 'invalid_ref'],
    [`ctx://${sourceId}/draft/draft%ZZ`, 'invalid_ref'],
  ] as const)('rejects non-addressable Ref %s before fetch', async (ref, code) => {
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        {
          ref,
          to: ['to@example.com'],
          subject: '',
          bodyText: '',
        },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code })
    expect(fetchCalls).toBe(0)
  })

  test('defensively rejects incomplete direct input before Ref parsing or fetch', async () => {
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        { ref: `ctx://${sourceId}/draft/draft-1`, subject: '', bodyText: '' },
        (async () => {
          fetchCalls += 1
          throw new Error('must not fetch')
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(fetchCalls).toBe(0)
  })

  test.each([
    [404, 'not_found'],
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [429, 'rate_limited'],
    [503, 'provider_unavailable'],
  ] as const)('maps HTTP %i with exactly one PUT', async (status, code) => {
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        {
          ref: `ctx://${sourceId}/draft/draft-1`,
          to: ['to@example.com'],
          subject: '',
          bodyText: '',
        },
        (async () => {
          fetchCalls += 1
          return new Response('{}', { status })
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code })
    expect(fetchCalls).toBe(1)
  })

  test.each([
    ['not-json', 'malformed JSON'],
    [JSON.stringify({ id: 'draft-1' }), 'missing Message'],
    [
      JSON.stringify({ id: 'other-draft', message: { id: 'message-2' } }),
      'mismatched Draft id',
    ],
  ])('maps %s response to provider_bad_response', async (body) => {
    let fetchCalls = 0
    const error = await gmailDraftUpdate(
      context(
        {
          ref: `ctx://${sourceId}/draft/draft-1`,
          to: ['to@example.com'],
          subject: '',
          bodyText: '',
        },
        (async () => {
          fetchCalls += 1
          return new Response(body)
        }) as unknown as typeof fetch,
      ),
    ).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'provider_bad_response' })
    expect(fetchCalls).toBe(1)
  })

  test('routes one Draft PUT through the non-production loopback base', async () => {
    const previousMockBase = process.env.CTXINDEX_GMAIL_MOCK_BASE_URL
    const previousNodeEnv = process.env.NODE_ENV
    process.env.CTXINDEX_GMAIL_MOCK_BASE_URL =
      'http://127.0.0.1:4567/mock-base/'
    process.env.NODE_ENV = 'test'
    resetEnvForTests()
    const urls: string[] = []
    try {
      await gmailDraftUpdate(
        context(
          {
            ref: `ctx://${sourceId}/draft/draft-1`,
            to: ['to@example.com'],
            subject: '',
            bodyText: '',
          },
          (async (input: Parameters<typeof fetch>[0]) => {
            urls.push(input.toString())
            return Response.json({
              id: 'draft-1',
              message: { id: 'message-2' },
            })
          }) as unknown as typeof fetch,
        ),
      )
    } finally {
      if (previousMockBase === undefined)
        delete process.env.CTXINDEX_GMAIL_MOCK_BASE_URL
      else process.env.CTXINDEX_GMAIL_MOCK_BASE_URL = previousMockBase
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      resetEnvForTests()
    }

    expect(urls).toEqual([
      'http://127.0.0.1:4567/mock-base/gmail/v1/users/me/drafts/draft-1',
    ])
  })
})
