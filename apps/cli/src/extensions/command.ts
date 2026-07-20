import { defineCommand } from 'citty'
import { runWithExit } from '../format/exit'
import { handleExtensionsCommand } from './handle-extensions-command'

const jsonArg = { type: 'boolean' as const, description: 'Print JSON' }
const trustArg = {
  type: 'boolean' as const,
  description: 'Acknowledge the explicit trust boundary',
}
const noRefreshArg = {
  type: 'boolean' as const,
  description: 'Use the stored Catalog snapshot without refreshing',
}

export const extensionsCommand = defineCommand({
  meta: { name: 'extensions', description: 'Inspect and manage Extensions.' },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List loaded Extensions.' },
      args: { json: jsonArg },
      run: ({ rawArgs }) =>
        runWithExit(() => handleExtensionsCommand(['list', ...rawArgs])),
    }),
    catalog: defineCommand({
      meta: { name: 'catalog', description: 'Manage trusted Git Catalogs.' },
      subCommands: {
        build: defineCommand({
          meta: {
            name: 'build',
            description:
              'Build an inert Catalog snapshot from a local package.',
          },
          args: {
            packageRoot: { type: 'positional', required: true },
            catalog: { type: 'string', required: false },
            output: {
              type: 'string',
              required: false,
              description:
                'Write the generated ctxindex-catalog.json manifest to this file path',
            },
            trust: trustArg,
            json: jsonArg,
          },
          run: ({ rawArgs }) =>
            runWithExit(() =>
              handleExtensionsCommand(['catalog', 'build', ...rawArgs]),
            ),
        }),
        add: defineCommand({
          meta: { name: 'add', description: 'Add a trusted Git Catalog.' },
          args: {
            name: { type: 'positional', required: true },
            repository: { type: 'positional', required: true },
            ref: { type: 'string', required: true },
            trust: trustArg,
            json: jsonArg,
          },
          run: ({ rawArgs }) =>
            runWithExit(() =>
              handleExtensionsCommand(['catalog', 'add', ...rawArgs]),
            ),
        }),
        list: defineCommand({
          meta: { name: 'list', description: 'List Git Catalogs.' },
          args: { noRefresh: noRefreshArg, json: jsonArg },
          run: ({ rawArgs }) =>
            runWithExit(() =>
              handleExtensionsCommand(['catalog', 'list', ...rawArgs]),
            ),
        }),
        show: defineCommand({
          meta: { name: 'show', description: 'Show a Git Catalog entry.' },
          args: {
            name: { type: 'positional', required: true },
            extension: { type: 'positional', required: false },
            noRefresh: noRefreshArg,
            json: jsonArg,
          },
          run: ({ rawArgs }) =>
            runWithExit(() =>
              handleExtensionsCommand(['catalog', 'show', ...rawArgs]),
            ),
        }),
        refresh: defineCommand({
          meta: { name: 'refresh', description: 'Refresh a Git Catalog pin.' },
          args: {
            name: { type: 'positional', required: true },
            json: jsonArg,
          },
          run: ({ rawArgs }) =>
            runWithExit(() =>
              handleExtensionsCommand(['catalog', 'refresh', ...rawArgs]),
            ),
        }),
        remove: defineCommand({
          meta: { name: 'remove', description: 'Remove a Git Catalog.' },
          args: {
            name: { type: 'positional', required: true },
            json: jsonArg,
          },
          run: ({ rawArgs }) =>
            runWithExit(() =>
              handleExtensionsCommand(['catalog', 'remove', ...rawArgs]),
            ),
        }),
      },
    }),
    search: defineCommand({
      meta: {
        name: 'search',
        description: 'Search Extensions across configured Catalogs.',
      },
      args: {
        query: { type: 'positional', required: false },
        noRefresh: noRefreshArg,
        json: jsonArg,
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleExtensionsCommand(['search', ...rawArgs])),
    }),
    install: defineCommand({
      meta: {
        name: 'install',
        description:
          'Install a Catalog Extension, or trust and install one explicit npm, Git, or local package.',
      },
      args: {
        source: { type: 'positional', required: true },
        target: { type: 'positional', required: true },
        extension: { type: 'string', required: false },
        trust: trustArg,
        noRefresh: noRefreshArg,
        json: jsonArg,
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleExtensionsCommand(['install', ...rawArgs])),
    }),
    update: defineCommand({
      meta: {
        name: 'update',
        description:
          'Explicitly reacquire and execute a directly installed Extension target.',
      },
      args: {
        extension: { type: 'positional', required: true },
        json: jsonArg,
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleExtensionsCommand(['update', ...rawArgs])),
    }),
    uninstall: defineCommand({
      meta: { name: 'uninstall', description: 'Uninstall an Extension.' },
      args: {
        extension: { type: 'positional', required: true },
        force: {
          type: 'boolean',
          description:
            'Remove direct activation while preserving dependent Sources and data',
        },
        json: jsonArg,
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleExtensionsCommand(['uninstall', ...rawArgs])),
    }),
  },
})
