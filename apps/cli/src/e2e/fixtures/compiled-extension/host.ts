import { importExtensionDefinition } from '@ctxindex/core/extension'

const packageRoot = process.argv[2]
if (!packageRoot) {
  throw new Error('usage: host <extension-package-root>')
}

const extension = await importExtensionDefinition(
  packageRoot,
  'fixture.extension',
)
console.log(
  JSON.stringify({
    id: extension.id,
    adapters: extension.adapters.map(({ id }) => id),
  }),
)
