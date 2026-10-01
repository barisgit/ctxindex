import * as profiles from '@ctxindex/profiles'
import * as calendarEvent from '@ctxindex/profiles/calendar-event'
import * as chatMessage from '@ctxindex/profiles/chat-message'
import * as file from '@ctxindex/profiles/file'
import * as mailMessage from '@ctxindex/profiles/mail-message'

function allIdentical(
  pairs: readonly (readonly [unknown, unknown])[],
): boolean {
  return pairs.every(([root, subpath]) => root === subpath)
}

console.log(
  JSON.stringify({
    root: [
      profiles.calendarEventProfile.id,
      profiles.chatMessageProfile.id,
      profiles.mailMessageProfile.id,
      profiles.fileProfile.id,
    ],
    subpaths: [
      calendarEvent.calendarEventProfile.id,
      chatMessage.chatMessageProfile.id,
      mailMessage.mailMessageProfile.id,
      file.fileProfile.id,
    ],
    identical: {
      calendarEvent: allIdentical([
        [profiles.calendarEventProfile, calendarEvent.calendarEventProfile],
        [profiles.calendarEventRef, calendarEvent.calendarEventRef],
        [profiles.calendarEventSchema, calendarEvent.calendarEventSchema],
      ]),
      chatMessage: allIdentical([
        [profiles.chatMessageNaturalKey, chatMessage.chatMessageNaturalKey],
        [profiles.chatMessageProfile, chatMessage.chatMessageProfile],
        [profiles.chatMessageSchema, chatMessage.chatMessageSchema],
      ]),
      mailMessage: allIdentical([
        [
          profiles.deriveMailMessageReplyRecipient,
          mailMessage.deriveMailMessageReplyRecipient,
        ],
        [
          profiles.deriveMailMessageReplyReferences,
          mailMessage.deriveMailMessageReplyReferences,
        ],
        [
          profiles.deriveMailMessageReplySubject,
          mailMessage.deriveMailMessageReplySubject,
        ],
        [
          profiles.MAX_DRAFT_ATTACHMENT_BYTES,
          mailMessage.MAX_DRAFT_ATTACHMENT_BYTES,
        ],
        [
          profiles.MAX_DRAFT_ATTACHMENT_COUNT,
          mailMessage.MAX_DRAFT_ATTACHMENT_COUNT,
        ],
        [
          profiles.mailMessageDraftAttachmentSchema,
          mailMessage.mailMessageDraftAttachmentSchema,
        ],
        [
          profiles.mailMessageDraftCreateInputSchema,
          mailMessage.mailMessageDraftCreateInputSchema,
        ],
        [
          profiles.mailMessageDraftUpdateInputSchema,
          mailMessage.mailMessageDraftUpdateInputSchema,
        ],
        [profiles.mailMessageProfile, mailMessage.mailMessageProfile],
        [profiles.mailMessageSchema, mailMessage.mailMessageSchema],
      ]),
      file: allIdentical([
        [profiles.chunkText, file.chunkText],
        [profiles.fileProfile, file.fileProfile],
        [profiles.fileSchema, file.fileSchema],
        [
          profiles.isNormalizedRelativeFilePath,
          file.isNormalizedRelativeFilePath,
        ],
      ]),
    },
  }),
)
