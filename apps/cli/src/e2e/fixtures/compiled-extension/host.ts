import * as builtins from '@ctxindex/adapters'
import { defaultConfig } from '@ctxindex/core/config'
import {
  importExtensionDefinition,
  loadExtensions,
} from '@ctxindex/core/extension'

const packageRoot = process.argv[2]
if (!packageRoot) {
  throw new Error('usage: host <extension-package-root>')
}

const extension = await importExtensionDefinition(
  packageRoot,
  'fixture.extension',
)
const loaded = await loadExtensions({ config: defaultConfig(), builtins })
console.log(
  JSON.stringify({
    id: extension.id,
    adapters: extension.adapters.map(({ id }) => id),
    builtinDocumentation: loaded.documentation.get(
      'ctxindex.local',
      'README.md',
    )?.content,
    builtinAdapterDocumentation: loaded.documentation.get(
      'ctxindex.local',
      'adapters/local.directory.md',
    )?.content,
  }),
)
