import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolveExtensionDocumentation } from '@ctxindex/core/extension'
import { googleDocumentation } from '../src/builtin-documentation/google/descriptor'
import { localDocumentation } from '../src/builtin-documentation/local/descriptor'
import { microsoftDocumentation } from '../src/builtin-documentation/microsoft/descriptor'
import {
  ctxindexGoogleExtension,
  ctxindexLocalExtension,
  ctxindexMicrosoftExtension,
} from '../src/builtins'

const sources = [
  {
    exportName: 'ctxindexGoogleDocumentation',
    extension: ctxindexGoogleExtension,
    declaration: googleDocumentation,
    moduleUrl: new URL(
      '../src/builtin-documentation/google/descriptor.ts',
      import.meta.url,
    ),
  },
  {
    exportName: 'ctxindexMicrosoftDocumentation',
    extension: ctxindexMicrosoftExtension,
    declaration: microsoftDocumentation,
    moduleUrl: new URL(
      '../src/builtin-documentation/microsoft/descriptor.ts',
      import.meta.url,
    ),
  },
  {
    exportName: 'ctxindexLocalDocumentation',
    extension: ctxindexLocalExtension,
    declaration: localDocumentation,
    moduleUrl: new URL(
      '../src/builtin-documentation/local/descriptor.ts',
      import.meta.url,
    ),
  },
] as const

function serializeFile(
  file: NonNullable<
    Awaited<ReturnType<typeof resolveExtensionDocumentation>>['documentation']
  >['files'][number],
): string {
  const content =
    typeof file.content === 'string'
      ? JSON.stringify(file.content)
      : `new Uint8Array([${[...file.content].join(', ')}])`
  return `    {
      path: ${JSON.stringify(file.path)},
      kind: ${JSON.stringify(file.kind)},
      mediaType: ${JSON.stringify(file.mediaType)},
      content: ${content},
    },`
}

const declarations: string[] = []
for (const source of sources) {
  const resolved = await resolveExtensionDocumentation(
    { ...source.extension, docs: source.declaration },
    source.moduleUrl,
  )
  if (resolved.documentation === undefined)
    throw new TypeError(
      `Missing built-in documentation for ${source.extension.id}`,
    )
  declarations.push(`export const ${source.exportName} = {
  kind: 'virtual',
  index: 'README.md',
  files: [
${resolved.documentation.files.map(serializeFile).join('\n')}
  ],
} as const satisfies DocumentationVirtualTreeDeclaration`)
}

const output = `import type { DocumentationVirtualTreeDeclaration } from '@ctxindex/extension-sdk'

${declarations.join('\n\n')}
`
await writeFile(
  resolve(import.meta.dir, '../src/generated/documentation.ts'),
  output,
  'utf8',
)
