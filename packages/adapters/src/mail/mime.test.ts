import { describe, expect, test } from 'bun:test'
import type { ActionArtifact } from '@ctxindex/extension-sdk'
import {
  MAX_DRAFT_ATTACHMENT_BYTES,
  MAX_DRAFT_ATTACHMENT_COUNT,
} from '@ctxindex/profiles'
import { renderMimeMessage, resolveDraftAttachments } from './mime'

const artifact = (overrides: Partial<ActionArtifact> = {}): ActionArtifact => ({
  ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/1/attachment/1',
  originRef: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/1',
  filename: 'porocilo-ž.txt',
  mediaType: 'application/octet-stream',
  byteSize: 4,
  bytes: Uint8Array.from([0, 1, 254, 255]),
  ...overrides,
})

describe('Draft MIME', () => {
  test('renders deterministic CRLF multipart MIME with exact folded binary bytes and Unicode filename', () => {
    const input = {
      headers: ['To: recipient@example.test', 'Subject: Files'],
      bodyText: 'line one\nline two',
      attachments: [artifact()],
    }
    const first = renderMimeMessage(input)
    expect(renderMimeMessage(input)).toBe(first)
    expect(first).not.toMatch(/(^|[^\r])\n/)
    expect(first).toContain("filename*=UTF-8''porocilo-%C5%BE.txt")
    expect(first).toContain('AAH+/w==')
    const boundary = /boundary="([^"]+)"/.exec(first)?.[1]
    expect(boundary).toMatch(/^ctxindex-[0-9a-f]{64}$/)
    expect(first.match(new RegExp(`--${boundary}`, 'g'))).toHaveLength(3)
  })

  test.each([
    { filename: '../secret' },
    { filename: 'bad\r\nname' },
    { mediaType: 'text/plain\r\nX: injected' },
    { byteSize: 3 },
  ])('rejects unsafe or inconsistent metadata', (override) => {
    expect(() =>
      renderMimeMessage({
        headers: [],
        bodyText: '',
        attachments: [artifact(override)],
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_action_input' }))
  })

  test('rejects duplicates and portable bounds', () => {
    expect(() =>
      renderMimeMessage({
        headers: [],
        bodyText: '',
        attachments: [artifact(), artifact()],
      }),
    ).toThrow()
    expect(() =>
      renderMimeMessage({
        headers: [],
        bodyText: '',
        attachments: Array.from(
          { length: MAX_DRAFT_ATTACHMENT_COUNT + 1 },
          (_, index) =>
            artifact({
              ref: `${artifact().ref}-${index}`,
              byteSize: 0,
              bytes: new Uint8Array(),
            }),
        ),
      }),
    ).toThrow()
    expect(() =>
      renderMimeMessage({
        headers: [],
        bodyText: '',
        attachments: [
          artifact({
            byteSize: MAX_DRAFT_ATTACHMENT_BYTES + 1,
            bytes: new Uint8Array(MAX_DRAFT_ATTACHMENT_BYTES + 1),
          }),
        ],
      }),
    ).toThrow()
  })

  test('resolves in order and gives download guidance without provider I/O', async () => {
    const first = artifact()
    const second = artifact({ ref: `${first.ref}-2`, filename: 'second.bin' })
    const resolved = await resolveDraftAttachments(
      {
        resolveArtifact: async (ref) =>
          [first, second].find((candidate) => candidate.ref === ref) ?? null,
      },
      [{ ref: second.ref }, { ref: first.ref }],
    )
    expect(resolved.map((value) => value.ref)).toEqual([second.ref, first.ref])
    const error = await resolveDraftAttachments(
      { resolveArtifact: async () => null },
      [{ ref: first.ref }],
    ).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'invalid_action_input' })
    expect(String(error)).toContain('ctxindex artifact download')
  })
})
