# @ctxindex/extension-sdk

Type-safe factories and runtime contracts for ctxindex Extensions and Catalogs.

```sh
bun add @ctxindex/extension-sdk
```

```ts
import {
  defineAdapter,
  defineCatalog,
  defineExtension,
  defineOAuthApp,
  defineProfile,
  defineProvider,
  docs,
  packageExtension,
  z,
} from '@ctxindex/extension-sdk'
```

The package exports the tested Zod instance as `z`, so definitions retain inference and use the same schemas ctxindex validates at runtime. Extensions are ordinary ESM packages and use the same SDK whether maintained by ctxindex or externally.

See the [Extension SDK guide](https://ctxindex.com/docs/extend) for providerless and provider-backed examples, documentation, package metadata, testing, and publishing. Public examples live in [`barisgit/ctxindex-extensions`](https://github.com/barisgit/ctxindex-extensions).

MIT licensed.
