import { describe, expect, test } from 'bun:test'
import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { DownloadContext } from '@ctxindex/extension-sdk'
import { gmailAdapterDefinition } from './builtins'

const sourceId = '01kxhbnecdah1t4mj38x88epfj'
const originRef = `ctx://${sourceId.toUpperCase()}/message/message-1`
const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} }

function operation() {
  const download = gmailAdapterDefinition.operations.download
  if (!download) throw new Error('missing Gmail download operation')
  return download
}

async function download(
  response:
    | Response
    | ((
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) => Promise<Response>),
  artifactRef = `${originRef}/attachment/attachment%2F1`,
  resolvedOriginRef = originRef,
  signal = new AbortController().signal,
) {
  const urls: URL[] = []
  const signals: (AbortSignal | null | undefined)[] = []
  const chunks: Uint8Array[] = []
  const fetch = (async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: RequestInit,
  ) => {
    urls.push(new URL(String(input)))
    signals.push(init?.signal)
    if (typeof response === 'function') return response(input, init)
    return response
  }) as typeof globalThis.fetch
  const context: DownloadContext = {
    source: { id: sourceId, config: {} },
    artifact: { ref: artifactRef, originRef: resolvedOriginRef },
    signal,
    fetch,
    logger,
    write(chunk) {
      chunks.push(chunk.slice())
    },
  }
  await operation()(context)
  return { urls, signals, bytes: Buffer.concat(chunks) }
}

describe('Gmail attachment download', () => {
  test('fetches the exact attachment URL and writes decoded bytes', async () => {
    const bytes = Buffer.alloc(150_000, 0xab)
    const result = await download(
      Response.json({
        data: bytes.toString('base64url'),
        size: bytes.length,
      }),
    )

    expect(result.urls).toHaveLength(1)
    expect(result.urls[0]?.pathname).toEndWith(
      '/users/me/messages/message-1/attachments/attachment%2F1',
    )
    expect(result.bytes).toEqual(bytes)
  })

  test('rejects malformed JSON', async () => {
    const error = await download(
      new Response('{broken', {
        headers: { 'content-type': 'application/json' },
      }),
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })

  test.each([
    [{}, 'missing data'],
    [{ data: '*' }, 'malformed data'],
    [{ data: 'A' }, 'malformed data'],
    [{ data: 'YQ', size: -1 }, 'invalid size'],
    [{ data: 'YQ', size: 2 }, 'size mismatch'],
  ])('rejects %s', async (body, _label) => {
    const error = await download(Response.json(body)).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code: 'provider_bad_response' })
  })

  test.each([
    [401, 'auth_expired'],
    [403, 'permission_denied'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [503, 'provider_unavailable'],
    [400, 'provider_bad_response'],
  ] as const)('maps HTTP status %i to %s', async (status, code) => {
    const error = await download(new Response('failed', { status })).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(CtxindexSyncError)
    expect(error).toMatchObject({ code })
  })

  test.each([
    [`${originRef}/attachment`, originRef],
    [`${originRef}/other/id`, originRef],
    [`${originRef}/attachment/id/extra`, originRef],
    [`${originRef}/attachment/id`, `${originRef}-other`],
    [
      `ctx://01ARZ3NDEKTSV4RRFFQ69G5FAA/message/message-1/attachment/id`,
      originRef,
    ],
  ])('rejects bad suffix/source before I/O', async (artifactRef, resolvedOriginRef) => {
    let calls = 0
    const error = await download(
      async () => {
        calls += 1
        return Response.json({ data: '' })
      },
      artifactRef,
      resolvedOriginRef,
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CtxindexValidationError)
    expect(calls).toBe(0)
  })

  test('passes and propagates cancellation', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    const error = await download(
      async (_input, init) => {
        ;(init?.signal as AbortSignal).throwIfAborted()
        return Response.json({ data: '' })
      },
      undefined,
      undefined,
      controller.signal,
    ).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ name: 'AbortError' })
  })
})
