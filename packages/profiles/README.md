# @ctxindex/profiles

Portable, versioned Profile definitions and payload schemas for ctxindex Resources.

```sh
bun add @ctxindex/profiles
```

Import the full collection or one stable subpath:

```ts
import { fileProfile, mailMessageProfile } from '@ctxindex/profiles'
import {
  type MailMessage,
  mailMessageSchema,
} from '@ctxindex/profiles/mail-message'
```

Published subpaths are `calendar-event`, `chat-message`, `mail-message`, and `file`. Each exports its canonical Profile, schema, inferred payload type, and related helpers where applicable.

See [Profiles](https://ctxindex.com/docs/extend/profiles) for authoring and compatibility guidance.

MIT licensed.
