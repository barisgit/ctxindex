import { handleArtifactCommand } from '../artifact/handle-artifact-command'
import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { resolveOutputFormat, structuredOutputArgs } from '../format/output'

export const artifactListCommand = defineCtxCommand({
  meta: {
    name: 'list',
    description: 'List Artifact descriptors for a Resource.',
  },
  args: {
    ref: { type: 'positional', required: true, description: 'Resource Ref' },
    ...structuredOutputArgs,
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleArtifactCommand({
        kind: 'list',
        ref: args.ref,
        format: resolveOutputFormat(args),
      }),
    ),
})

export const artifactDownloadCommand = defineCtxCommand({
  meta: {
    name: 'download',
    description: 'Download an Artifact into the managed cache.',
  },
  args: {
    ref: { type: 'positional', required: true, description: 'Artifact Ref' },
    output: { type: 'string', description: 'Copy cached bytes to this path' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleArtifactCommand({
        kind: 'download',
        ref: args.ref,
        ...(args.output === undefined ? {} : { outputPath: args.output }),
        json: args.json ?? false,
      }),
    ),
})

export const artifactPurgeCommand = defineCtxCommand({
  meta: {
    name: 'purge',
    description: 'Remove all managed Artifact cache state.',
  },
  args: {
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleArtifactCommand({ kind: 'purge', json: args.json ?? false }),
    ),
})

export const artifactCommand = defineCtxCommand({
  meta: {
    name: 'artifact',
    description: 'List, download, and purge managed Artifacts.',
  },
  subCommands: {
    list: artifactListCommand,
    download: artifactDownloadCommand,
    purge: artifactPurgeCommand,
  },
})
