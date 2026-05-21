import { defineCommand } from 'citty'
import { getSkillContent, listSkills } from '../skills/loader'
import { resolveBundledSkillsDir } from '../skills/resolve'

export const skillsCommand = defineCommand({
  meta: {
    name: 'skills',
    description: 'Read bundled ctxindex skill docs',
  },
  subCommands: {
    list: defineCommand({
      meta: {
        name: 'list',
        description: 'List bundled skills',
      },
      args: {
        json: {
          type: 'boolean',
          description: 'Print machine-readable JSON',
        },
      },
      async run({ args }) {
        const skills = await listSkills(resolveBundledSkillsDir())

        if (args.json) {
          console.log(JSON.stringify(skills, null, 2))
          return
        }

        for (const skill of skills) {
          console.log(`${skill.name}\t${skill.summary}`)
        }
      },
    }),
    get: defineCommand({
      meta: {
        name: 'get',
        description: 'Print one bundled skill',
      },
      args: {
        name: {
          type: 'positional',
          description: 'Skill name',
        },
        inline: {
          type: 'boolean',
          description: 'Inline relative markdown links',
        },
        json: {
          type: 'boolean',
          description: 'Print machine-readable JSON',
        },
      },
      async run({ args }) {
        const { name } = args

        if (!name) {
          throw new Error('Missing required skill name')
        }

        const skill = await getSkillContent(resolveBundledSkillsDir(), name, {
          inline: args.inline ?? false,
        })

        if (args.json) {
          console.log(JSON.stringify(skill, null, 2))
          return
        }

        console.log(skill.content)
      },
    }),
    path: defineCommand({
      meta: {
        name: 'path',
        description: 'Print the bundled skills directory',
      },
      run() {
        console.log(resolveBundledSkillsDir())
      },
    }),
  },
})
