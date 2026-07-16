import { describe, expect, test } from 'bun:test'
import {
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { DownloadContext } from '@ctxindex/extension-sdk'
import { microsoftMailboxAdapterDefinition } from './definition'

const sourceId = '01kxhbnecdah1t4mj38x88epfj'
const originRef = `ctx://${sourceId.toUpperCase()}/message/immutable-id`
const artifactRef = `${originRef}/attachment/attachment%2F1`

function operation() {
  const operation = microsoftMailboxAdapterDefinition.operations.download
  if (!operation)
    throw new Error('missing Microsoft mailbox download operation')
  return operation
}

async function download(
  providerFetch: typeof fetch,
  ref = artifactRef,
  origin = originRef,
) {
  const chunks: Uint8Array[] = []
  const context: DownloadContext = {
    source: { id: sourceId, config: {} },
    artifact: {
      ref,
      originRef: origin,
      filename: 'report.txt',
      mediaType: 'text/plain',
      byteSize: 4,
    },
    signal: new AbortController().signal,
    fetch: providerFetch,
    logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
    write(chunk) {
      chunks.push(chunk.slice())
    },
  }
  await operation()(context)
  return Buffer.concat(chunks)
}

describe('Microsoft mailbox attachment download', () => {
  test('streams exact fileAttachment $value bytes with immutable-id preference', async () => {
    let request: Request | undefined
    const bytes = await download((async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      request = new Request(String(input), init)
      return new Response('data', {
        headers: { 'content-type': 'text/plain', 'content-length': '4' },
      })
    }) as unknown as typeof fetch)
    expect(new URL(request?.url ?? '').pathname).toBe(
      '/v1.0/me/messages/immutable-id/attachments/attachment%2F1/$value',
    )
    expect(request?.headers.get('prefer')).toBe('IdType="ImmutableId"')
    expect(bytes.toString()).toBe('data')
  })

  test.each([
    [`${originRef}/attachment`, originRef],
    [`${originRef}/attachment/a/b`, originRef],
    [
      `ctx://01ARZ3NDEKTSV4RRFFQ69G5FAA/message/immutable-id/attachment/id`,
      originRef,
    ],
    [artifactRef, `${originRef}-other`],
  ])('rejects malformed or foreign Artifact before I/O', async (ref, origin) => {
    let calls = 0
    const providerFetch = (async () => {
      calls += 1
      return new Response('')
    }) as unknown as typeof fetch
    const error = await download(providerFetch, ref, origin).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(CtxindexValidationError)
    expect(calls).toBe(0)
  })

  test('validates declared size and media type', async () => {
    const sizeError = await download(
      (async () =>
        new Response('bad', {
          headers: { 'content-type': 'text/plain', 'content-length': '3' },
        })) as unknown as typeof fetch,
    ).catch((caught) => caught)
    expect(sizeError).toBeInstanceOf(CtxindexSyncError)
    expect(sizeError).toMatchObject({ code: 'provider_bad_response' })
    const mediaError = await download(
      (async () =>
        new Response('data', {
          headers: {
            'content-type': 'application/json',
            'content-length': '4',
          },
        })) as unknown as typeof fetch,
    ).catch((caught) => caught)
    expect(mediaError).toMatchObject({ code: 'provider_bad_response' })
  })
})
