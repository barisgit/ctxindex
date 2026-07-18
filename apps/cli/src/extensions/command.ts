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
    install: defineCommand({
      meta: { name: 'install', description: 'Install a Catalog Extension.' },
      args: {
        catalog: { type: 'positional', required: true },
        extension: { type: 'positional', required: true },
        trust: trustArg,
        noRefresh: noRefreshArg,
        json: jsonArg,
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleExtensionsCommand(['install', ...rawArgs])),
    }),
    uninstall: defineCommand({
      meta: { name: 'uninstall', description: 'Uninstall an Extension.' },
      args: {
        extension: { type: 'positional', required: true },
        json: jsonArg,
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleExtensionsCommand(['uninstall', ...rawArgs])),
    }),
  },
})
