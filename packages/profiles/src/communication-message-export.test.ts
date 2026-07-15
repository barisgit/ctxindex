import { describe, expect, test } from 'bun:test'
import { communicationMessageProfile } from './communication-message'

const renderEml = communicationMessageProfile.exports?.eml?.render

describe('communication.message EML export', () => {
  test('declares the RFC 822 media type', () => {
    expect(communicationMessageProfile.exports?.eml?.mediaType).toBe(
      'message/rfc822',
    )
  })

  test('renders full messages with fixed headers, UTC dates, and CRLF bytes', () => {
    expect(
      renderEml?.({
        providerMessageId: 'provider-1',
        from: ['sender@example.com'],
        to: ['one@example.com', 'two@example.com'],
        subject: 'Hello',
        date: '2024-01-02T03:04:05.000Z',
        rfcMessageId: '<message@example.com>',
        inReplyTo: '<parent@example.com>',
        bodyText: 'line one\nline two\rline three\r\nline four',
      }),
    ).toBe(
      [
        'From: sender@example.com',
        'To: one@example.com, two@example.com',
        'Subject: Hello',
        'Date: Tue, 02 Jan 2024 03:04:05 GMT',
        'Message-ID: <message@example.com>',
        'In-Reply-To: <parent@example.com>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        'line one',
        'line two',
        'line three',
        'line four',
      ].join('\r\n'),
    )
  })

  test('renders a minimal message without snippet fallback or attachment headers', () => {
    const rendered = renderEml?.({
      providerMessageId: 'provider-1',
      snippet: 'not the body',
      attachments: [
        {
          ref: 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one/attachment/a',
          filename: 'secret.bin',
        },
      ],
    })
    expect(rendered).toBe(
      [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        '',
      ].join('\r\n'),
    )
    expect(rendered).not.toContain('not the body')
    expect(rendered).not.toContain('secret.bin')
  })

  test('sanitizes every header value and is byte-identical across calls', () => {
    const payload = {
      providerMessageId: 'provider-1',
      from: ['safe@example.com\r\nBcc: injected@example.com'],
      to: ['one@example.com\nX-Test: injected', 'two@example.com'],
      subject: 'hello\r\nX-Injected: yes',
      rfcMessageId: '<id@example.com>\r\nBad: yes',
      inReplyTo: '<parent@example.com>\nBad: yes',
      bodyText: 'body',
    }
    const first = renderEml?.(payload)
    expect(first).toBe(renderEml?.(payload))
    expect(first).toContain(
      'From: safe@example.com Bcc: injected@example.com\r\n',
    )
    expect(first).toContain(
      'To: one@example.com X-Test: injected, two@example.com\r\n',
    )
    expect(first).toContain('Subject: hello X-Injected: yes\r\n')
    expect(first).not.toContain('\r\nBcc:')
    expect(first).not.toContain('\r\nX-Injected:')
  })
})
