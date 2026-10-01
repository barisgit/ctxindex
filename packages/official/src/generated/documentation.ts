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
        '# Google\n\nUse the Google Calendar and Gmail Adapters with a configured Google account.\n\nThe Extension includes a public desktop OAuth App labeled `ctxindex`, so\n`ctxindex account add google` can start the provider-direct loopback flow\nwithout local App setup. The registration metadata is public; tokens and\naccount data stay in the local ctxindex secret backend and database.\n\nGoogle verification and scope approval remain pending.\nThe provider may show an unverified warning or reject an account or requested\nscope. This documentation does not claim production verification. To use your\nown Google registration instead, import it and select its exact label:\n\n```sh\nctxindex oauth-app add google <label> --from-env\nctxindex account add google --app <label>\n```\n',
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
        '# Microsoft\n\nUse the Microsoft Calendar and mailbox Adapters with a configured Microsoft account.\n\nThe Extension includes a public native OAuth App labeled `ctxindex`, so\n`ctxindex account add microsoft` can start the provider-direct loopback flow\nwithout local App setup. The public application id is not a secret; tokens and\naccount data stay in the local ctxindex secret backend and database.\n\nPublisher verification, tenant consent, and account-type policy can still\naffect authorization. This documentation does not claim that every Microsoft\ntenant or account has approved the App. To use your own Microsoft registration\ninstead, import it and select its exact label:\n\n```sh\nctxindex oauth-app add microsoft <label> --from-env\nctxindex account add microsoft --app <label>\n```\n',
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
