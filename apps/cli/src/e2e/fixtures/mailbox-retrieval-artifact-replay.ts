import type { MockGmailMessage } from '../_mock-gmail'
import type { MockGraphMessage } from '../_mock-graph'

const rootMessageId = '<invented-replay-root@example.test>'
const replyMessageId = '<invented-replay-reply@example.test>'

export const mailboxReplayFixture = {
  query: 'Invented mailbox replay',
  rootProviderId: 'invented-replay-root',
  replyProviderId: 'invented-replay-reply',
  conversationId: 'invented-replay-conversation',
  rootMessageId,
  replyMessageId,
  subject: 'Re: Invented mailbox replay',
  body: 'Obviously invented mailbox replay body from example.test.\n',
  attachmentText: 'Obviously invented attachment bytes from example.test.\n',
  sender: 'sender@example.test',
  recipient: 'recipient@example.test',
} as const

export const gmailMailboxReplayMessages: readonly MockGmailMessage[] = [
  {
    id: mailboxReplayFixture.rootProviderId,
    threadId: mailboxReplayFixture.conversationId,
    subject: 'Invented mailbox replay root',
    body: 'Obviously invented root body from example.test.\n',
    historyId: '25001',
    messageId: mailboxReplayFixture.rootMessageId,
    date: 'Fri, 10 Jul 2026 08:00:00 +0000',
  },
  {
    id: mailboxReplayFixture.replyProviderId,
    threadId: mailboxReplayFixture.conversationId,
    subject: mailboxReplayFixture.subject,
    body: mailboxReplayFixture.body,
    historyId: '25002',
    messageId: mailboxReplayFixture.replyMessageId,
    inReplyTo: mailboxReplayFixture.rootMessageId,
    date: 'Fri, 10 Jul 2026 09:00:00 +0000',
    attachmentText: mailboxReplayFixture.attachmentText,
  },
]

export const microsoftMailboxReplayMessages: readonly MockGraphMessage[] = [
  {
    id: mailboxReplayFixture.rootProviderId,
    conversationId: mailboxReplayFixture.conversationId,
    internetMessageId: mailboxReplayFixture.rootMessageId,
    subject: 'Invented mailbox replay root',
    bodyPreview: 'Obviously invented root preview from example.test.',
    body: 'Obviously invented root body from example.test.\n',
    from: { name: 'Invented Sender', address: mailboxReplayFixture.sender },
    to: [{ address: mailboxReplayFixture.recipient }],
    receivedDateTime: '2026-07-10T08:00:00Z',
    lastModifiedDateTime: '2026-07-10T08:01:00Z',
  },
  {
    id: mailboxReplayFixture.replyProviderId,
    conversationId: mailboxReplayFixture.conversationId,
    internetMessageId: mailboxReplayFixture.replyMessageId,
    inReplyTo: mailboxReplayFixture.rootMessageId,
    subject: mailboxReplayFixture.subject,
    bodyPreview: 'Obviously invented mailbox replay preview from example.test.',
    body: mailboxReplayFixture.body,
    from: { name: 'Invented Sender', address: mailboxReplayFixture.sender },
    to: [{ address: mailboxReplayFixture.recipient }],
    receivedDateTime: '2026-07-10T09:00:00Z',
    lastModifiedDateTime: '2026-07-10T09:01:00Z',
    attachments: [
      {
        id: 'invented-replay-attachment',
        name: 'invented-mailbox-replay.txt',
        contentType: 'text/plain',
        bytes: new TextEncoder().encode(mailboxReplayFixture.attachmentText),
      },
    ],
  },
]
