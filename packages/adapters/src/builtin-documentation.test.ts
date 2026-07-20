import { expect, test } from 'bun:test'
import { defaultConfig } from '@ctxindex/core/config'
import {
  loadExtensions,
  type ResolvedDocumentationTree,
  resolveExtensionDocumentation,
} from '@ctxindex/core/extension'
import { googleDocumentation } from './builtin-documentation/google/descriptor'
import { localDocumentation } from './builtin-documentation/local/descriptor'
import { microsoftDocumentation } from './builtin-documentation/microsoft/descriptor'
import {
  ctxindexGoogleExtension,
  ctxindexLocalExtension,
  ctxindexMicrosoftExtension,
} from './builtins'
import * as builtinModule from './index'

const fixtures = [
  {
    extension: ctxindexGoogleExtension,
    declaration: googleDocumentation,
    moduleUrl: new URL(
      './builtin-documentation/google/descriptor.ts',
      import.meta.url,
    ),
  },
  {
    extension: ctxindexMicrosoftExtension,
    declaration: microsoftDocumentation,
    moduleUrl: new URL(
      './builtin-documentation/microsoft/descriptor.ts',
      import.meta.url,
    ),
  },
  {
    extension: ctxindexLocalExtension,
    declaration: localDocumentation,
    moduleUrl: new URL(
      './builtin-documentation/local/descriptor.ts',
      import.meta.url,
    ),
  },
] as const

test('embedded built-in trees match directory sources through the shared resolver', async () => {
  for (const fixture of fixtures) {
    const directory = await resolveExtensionDocumentation(
      {
        ...fixture.extension,
        docs: fixture.declaration,
      },
      fixture.moduleUrl,
    )
    const embedded = await resolveExtensionDocumentation(fixture.extension)
    expect(embedded.documentation as ResolvedDocumentationTree).toEqual(
      directory.documentation as ResolvedDocumentationTree,
    )
  }
})

test('the collected built-in namespace exposes embedded documentation', async () => {
  const loaded = await loadExtensions({
    config: defaultConfig(),
    builtins: builtinModule,
  })

  expect(loaded.documentation.get('ctxindex.local', 'README.md')).toMatchObject(
    {
      extensionId: 'ctxindex.local',
      origin: 'authored',
      content:
        '# Local directory\n\nUse the local-directory Adapter to index supported files from an acquired directory tree.\n\nSee the [local.directory Adapter](adapters/local.directory.md).\n',
    },
  )
  expect(
    loaded.documentation.get('ctxindex.local', 'adapters/local.directory.md'),
  ).toMatchObject({
    extensionId: 'ctxindex.local',
    origin: 'authored',
    definition: { kind: 'adapter', id: 'local.directory' },
  })
})
