# @ctxindex/extension-sdk

Type-safe factories and contracts for authoring ctxindex Extensions and Catalogs.

```ts
import {
  defineAdapter,
  defineExtension,
  defineProfile,
  z,
} from '@ctxindex/extension-sdk'

const note = defineProfile({
  id: 'example.note',
  version: 1,
  schema: z.object({ title: z.string(), body: z.string() }),
  search: {
    title: (value) => value.title,
    chunks: (value) => [value.body],
  },
})

const adapter = defineAdapter({
  id: 'example.notes',
  configSchema: z.object({}),
  profiles: [note],
  routing: 'indexed',
  capabilities: [],
  operations: {},
  actions: {},
})

export default defineExtension({
  id: 'example.notes',
  profiles: [note],
  adapters: [adapter],
})
```

Extensions are ordinary ESM packages. Add their built entry to `ctxindex.extensions` in `package.json`; install them directly from npm, Git, or a local directory; or include them in a ctxindex Catalog.

The SDK targets Bun 1.3.14 and exports Zod as `z` so schemas and inferred types use the tested compatible version. See [ctxindex.com/docs](https://ctxindex.com/docs) for the complete authoring guide.

Licensed under MIT.
