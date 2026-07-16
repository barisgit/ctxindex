import { defineCommand } from 'citty'
import { parseSkillsArgs, skillsUsage } from '../args/skills'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatSkill, formatSkillsList } from '../format/skills'
import { getSkillContent, listSkills } from '../skills/loader'
import { resolveBundledSkills } from '../skills/resolve'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export async function handleSkillsCommand(args: string[]): Promise<number> {
  const parsed = parseSkillsArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${skillsUsage}`)
    return 2
  }

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

export const skillsCommand = defineCommand({
  meta: { name: 'skills', description: 'Inspect bundled skills.' },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List bundled skills.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleSkillsCommand(['list', ...rawArgs])),
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'Print a bundled skill.' },
      args: {
        name: { type: 'positional', required: false },
        inline: { type: 'boolean', description: 'Inline file references' },
        json: { type: 'boolean', description: 'Print JSON' },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleSkillsCommand(['get', ...rawArgs])),
    }),
    path: defineCommand({
      meta: { name: 'path', description: 'Print bundled skills location.' },
      run: () => runWithExit(() => handleSkillsCommand(['path'])),
    }),
  },
})
