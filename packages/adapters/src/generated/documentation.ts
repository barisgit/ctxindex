import type { DocumentationVirtualTreeDeclaration } from '@ctxindex/extension-sdk'

export const ctxindexGoogleDocumentation = {
  kind: 'virtual',
  index: 'README.md',
  files: [
    {
      path: 'README.md',
      kind: 'markdown',
      mediaType: 'text/markdown',
      content:
        '# Google\n\nUse the Google Calendar and Gmail Adapters with a configured Google account.\n',
    },
  ],
} as const satisfies DocumentationVirtualTreeDeclaration

export const ctxindexMicrosoftDocumentation = {
  kind: 'virtual',
  index: 'README.md',
  files: [
    {
      path: 'README.md',
      kind: 'markdown',
      mediaType: 'text/markdown',
      content:
        '# Microsoft\n\nUse the Microsoft Calendar and mailbox Adapters with a configured Microsoft account.\n',
    },
  ],
} as const satisfies DocumentationVirtualTreeDeclaration

export const ctxindexLocalDocumentation = {
  kind: 'virtual',
  index: 'README.md',
  files: [
    {
      path: 'README.md',
      kind: 'markdown',
      mediaType: 'text/markdown',
      content:
        '# Local directory\n\nUse the local-directory Adapter to index supported files from an acquired directory tree.\n\nSee the [local.directory Adapter](adapters/local.directory.md).\n',
    },
    {
      path: 'adapters/local.directory.md',
      kind: 'markdown',
      mediaType: 'text/markdown',
      content:
        '# local.directory\n\nIndexes supported files from a configured local directory.\n',
    },
  ],
} as const satisfies DocumentationVirtualTreeDeclaration
