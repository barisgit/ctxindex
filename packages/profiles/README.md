# @ctxindex/profiles

Portable, versioned domain Profiles for ctxindex Resources.

```ts
import { mailMessageProfile } from '@ctxindex/profiles/mail-message'

console.log(mailMessageProfile.id)
```

The package exports the complete Profile collection from `@ctxindex/profiles`
and dedicated `calendar-event`, `chat-message`, `mail-message`, and `file`
subpaths. Profile schemas use the tested Zod version shared with
`@ctxindex/extension-sdk`.

Licensed under MIT.
