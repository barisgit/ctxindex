import { defineCtxCommand } from '../command-model'
import {
  docsGetCommand,
  docsGetSkillCommand,
  docsListCommand,
  docsSearchCommand,
} from '../docs/command'

export const docsCommand = defineCtxCommand({
  meta: {
    name: 'docs',
    description: 'Inspect bundled and loaded Extension documentation offline.',
  },
  subCommands: {
    list: docsListCommand,
    get: docsGetCommand,
    'get-skill': docsGetSkillCommand,
    search: docsSearchCommand,
  },
})
