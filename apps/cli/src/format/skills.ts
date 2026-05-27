import type { SkillDocument, SkillRecord } from '../skills/loader'

export function formatSkillsList(
  skills: SkillRecord[],
  opts: { readonly json: boolean },
): string {
  if (opts.json) return JSON.stringify(skills, null, 2)
  return skills.map((skill) => `${skill.name}\t${skill.summary}`).join('\n')
}

export function formatSkill(
  skill: SkillDocument,
  opts: { readonly json: boolean },
): string {
  return opts.json ? JSON.stringify(skill, null, 2) : skill.content
}
