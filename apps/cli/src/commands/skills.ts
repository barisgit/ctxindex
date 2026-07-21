import { defineCtxCommand } from '../command-model'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { outputFormatArg } from '../format/output'
import { formatSkill, formatSkillsList } from '../format/skills'
import { getSkillContent, listSkills } from '../skills/loader'
import { resolveBundledSkills } from '../skills/resolve'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export type SkillsCommandInput =
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'get'
      readonly name: string
      readonly inline: boolean
      readonly json: boolean
    }
  | { readonly kind: 'path' }

export async function handleSkillsCommand(
  parsed: SkillsCommandInput,
): Promise<number> {
  try {
    const skills = resolveBundledSkills()
    if (parsed.kind === 'list') {
      printOutput(formatSkillsList(await listSkills(skills), parsed))
    } else if (parsed.kind === 'get') {
      printOutput(
        formatSkill(await getSkillContent(skills, parsed.name, parsed), parsed),
      )
    } else {
      console.log(skills.location)
    }
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  }
}

export const skillsCommand = defineCtxCommand({
  meta: { name: 'skills', description: 'Inspect bundled skills.' },
  subCommands: {
    list: defineCtxCommand({
      meta: { name: 'list', description: 'List bundled skills.' },
      args: { format: outputFormatArg },
      run: ({ args }) =>
        runWithExit(() =>
          handleSkillsCommand({
            kind: 'list',
            json: args.format === 'json',
          }),
        ),
    }),
    get: defineCtxCommand({
      meta: { name: 'get', description: 'Print a bundled skill.' },
      args: {
        name: { type: 'positional', required: true },
        inline: { type: 'boolean', description: 'Inline file references' },
        format: outputFormatArg,
      },
      run: ({ args }) =>
        runWithExit(() =>
          handleSkillsCommand({
            kind: 'get',
            name: args.name,
            inline: args.inline ?? false,
            json: args.format === 'json',
          }),
        ),
    }),
    path: defineCtxCommand({
      meta: { name: 'path', description: 'Print bundled skills location.' },
      run: () => runWithExit(() => handleSkillsCommand({ kind: 'path' })),
    }),
  },
})
