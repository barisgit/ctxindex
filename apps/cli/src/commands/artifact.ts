import { defineCommand } from 'citty'
import { handleArtifactCommand } from '../artifact/handle-artifact-command'
import { runWithExit } from '../format/exit'

export const artifactListCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List Artifact descriptors for a Resource.',
  },
  args: {
    ref: { type: 'positional', required: false, description: 'Resource Ref' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) =>
    runWithExit(() => handleArtifactCommand(['list', ...rawArgs])),
})

export const artifactDownloadCommand = defineCommand({
  meta: {
    name: 'download',
    description: 'Download an Artifact into the managed cache.',
  },
  args: {
    ref: { type: 'positional', required: false, description: 'Artifact Ref' },
    output: { type: 'string', description: 'Copy cached bytes to this path' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) =>
    runWithExit(() => handleArtifactCommand(['download', ...rawArgs])),
})

export const artifactCommand = defineCommand({
  meta: {
    name: 'artifact',
    description: 'List and download managed Artifacts.',
  },
  subCommands: { list: artifactListCommand, download: artifactDownloadCommand },
})
