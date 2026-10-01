import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { resolveOutputFormat, structuredOutputArgs } from '../format/output'
import { handleRealmCommand } from '../realm/handle-realm-command'

export { handleRealmCommand }

export const realmCommand = defineCtxCommand({
  meta: { name: 'realm', description: 'Manage indexing realms.' },
  subCommands: {
    add: defineCtxCommand({
      meta: { name: 'add', description: 'Add a realm.' },
      args: {
        slug: { type: 'positional', required: true },
        name: { type: 'string', description: 'Realm display name' },
      },
      run: ({ args }) =>
        runWithExit(() =>
          handleRealmCommand({
            kind: 'add',
            slug: args.slug,
            ...(args.name !== undefined ? { name: args.name } : {}),
          }),
        ),
    }),
    list: defineCtxCommand({
      meta: { name: 'list', description: 'List existing realms.' },
      args: structuredOutputArgs,
      run: ({ args }) =>
        runWithExit(() =>
          handleRealmCommand({
            kind: 'list',
            format: resolveOutputFormat(args),
          }),
        ),
    }),
  },
})
