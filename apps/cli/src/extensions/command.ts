import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { handleExtensionsCommand } from './handle-extensions-command'

const jsonArg = {
  type: 'boolean' as const,
  default: false as const,
  description: 'Print JSON',
}
const trustArg = {
  type: 'boolean' as const,
  required: true as const,
  description: 'Acknowledge the explicit trust boundary',
}
const refreshArg = {
  type: 'boolean' as const,
  default: true as const,
  description: 'Refresh Catalog state before reading',
  negativeDescription: 'Use the stored Catalog snapshot without refreshing',
}

export const extensionCommand = defineCtxCommand({
  meta: { name: 'extension', description: 'Inspect and manage Extensions.' },
  subCommands: {
    list: defineCtxCommand({
      meta: { name: 'list', description: 'List loaded Extensions.' },
      args: { json: jsonArg },
      run: ({ args }) =>
        runWithExit(() =>
          handleExtensionsCommand({ kind: 'list', json: args.json }),
        ),
    }),
    catalog: defineCtxCommand({
      meta: { name: 'catalog', description: 'Manage trusted Git Catalogs.' },
      subCommands: {
        build: defineCtxCommand({
          meta: {
            name: 'build',
            description:
              'Build an inert Catalog snapshot from a trusted local package.',
          },
          args: {
            'package-root': {
              type: 'positional',
              required: true,
              description: 'Catalog author package root',
            },
            catalog: { type: 'string', description: 'Exact Catalog id' },
            output: {
              type: 'string',
              description:
                'Write the generated ctxindex-catalog.json manifest to this file path',
            },
            trust: trustArg,
            json: jsonArg,
          },
          run: ({ args }) =>
            runWithExit(() =>
              handleExtensionsCommand({
                kind: 'catalog-build',
                packageRoot: args['package-root'],
                ...(args.catalog === undefined
                  ? {}
                  : { catalogId: args.catalog }),
                ...(args.output === undefined ? {} : { output: args.output }),
                trust: args.trust,
                json: args.json,
              }),
            ),
        }),
        add: defineCtxCommand({
          meta: { name: 'add', description: 'Add a trusted Git Catalog.' },
          args: {
            name: { type: 'positional', required: true },
            repository: { type: 'positional', required: true },
            ref: { type: 'string', required: true },
            trust: trustArg,
            json: jsonArg,
          },
          run: ({ args }) =>
            runWithExit(() =>
              handleExtensionsCommand({
                kind: 'catalog-add',
                name: args.name,
                repository: args.repository,
                ref: args.ref,
                trust: args.trust,
                json: args.json,
              }),
            ),
        }),
        list: defineCtxCommand({
          meta: { name: 'list', description: 'List Git Catalogs.' },
          args: { refresh: refreshArg, json: jsonArg },
          run: ({ args }) =>
            runWithExit(() =>
              handleExtensionsCommand({
                kind: 'catalog-list',
                noRefresh: !args.refresh,
                json: args.json,
              }),
            ),
        }),
        show: defineCtxCommand({
          meta: { name: 'show', description: 'Show a Git Catalog entry.' },
          args: {
            name: { type: 'positional', required: true },
            'extension-id': { type: 'positional', required: false },
            refresh: refreshArg,
            json: jsonArg,
          },
          run: ({ args }) =>
            runWithExit(() =>
              handleExtensionsCommand({
                kind: 'catalog-show',
                name: args.name,
                ...(args['extension-id'] === undefined
                  ? {}
                  : { extensionId: args['extension-id'] }),
                noRefresh: !args.refresh,
                json: args.json,
              }),
            ),
        }),
        search: defineCtxCommand({
          meta: {
            name: 'search',
            description: 'Search Extensions across configured Catalogs.',
          },
          args: {
            query: { type: 'positional', required: false },
            refresh: refreshArg,
            json: jsonArg,
          },
          run: ({ args }) =>
            runWithExit(() =>
              handleExtensionsCommand({
                kind: 'catalog-search',
                ...(args.query === undefined ? {} : { query: args.query }),
                noRefresh: !args.refresh,
                json: args.json,
              }),
            ),
        }),
        refresh: defineCtxCommand({
          meta: { name: 'refresh', description: 'Refresh a Git Catalog pin.' },
          args: {
            name: { type: 'positional', required: true },
            json: jsonArg,
          },
          run: ({ args }) =>
            runWithExit(() =>
              handleExtensionsCommand({
                kind: 'catalog-refresh',
                name: args.name,
                json: args.json,
              }),
            ),
        }),
        remove: defineCtxCommand({
          meta: { name: 'remove', description: 'Remove a Git Catalog.' },
          args: {
            name: { type: 'positional', required: true },
            json: jsonArg,
          },
          run: ({ args }) =>
            runWithExit(() =>
              handleExtensionsCommand({
                kind: 'catalog-remove',
                name: args.name,
                json: args.json,
              }),
            ),
        }),
      },
    }),
    install: defineCtxCommand({
      meta: {
        name: 'install',
        description:
          'Trust, acquire, and execute one exact Catalog, npm, Git, or local Extension.',
      },
      args: {
        'source-kind': {
          type: 'positional',
          required: true,
          options: ['catalog', 'npm', 'git', 'local'],
          description: 'Exact Extension source kind',
        },
        target: {
          type: 'positional',
          required: true,
          description: 'Catalog name or direct package target',
        },
        'extension-id': {
          type: 'positional',
          required: true,
          description: 'Stable Extension id',
        },
        refresh: refreshArg,
        json: jsonArg,
      },
      run: ({ args }) =>
        runWithExit(() =>
          handleExtensionsCommand({
            kind: 'install',
            sourceKind: args['source-kind'],
            target: args.target,
            extensionId: args['extension-id'],
            noRefresh: !args.refresh,
            json: args.json,
          }),
        ),
    }),
    update: defineCtxCommand({
      meta: {
        name: 'update',
        description:
          'Trust, reacquire, and execute an installed Extension from its persisted provenance.',
      },
      args: {
        'extension-id': { type: 'positional', required: true },
        json: jsonArg,
      },
      run: ({ args }) =>
        runWithExit(() =>
          handleExtensionsCommand({
            kind: 'update',
            extensionId: args['extension-id'],
            json: args.json,
          }),
        ),
    }),
    uninstall: defineCtxCommand({
      meta: { name: 'uninstall', description: 'Uninstall an Extension.' },
      args: {
        'extension-id': { type: 'positional', required: true },
        force: {
          type: 'boolean',
          default: false,
          description:
            'Remove activation while preserving dependent Sources and data',
        },
        json: jsonArg,
      },
      run: ({ args }) =>
        runWithExit(() =>
          handleExtensionsCommand({
            kind: 'uninstall',
            extensionId: args['extension-id'],
            force: args.force,
            json: args.json,
          }),
        ),
    }),
  },
})
