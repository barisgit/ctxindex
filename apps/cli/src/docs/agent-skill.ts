import { buildAgentSkill } from './agent-skill.macro' with { type: 'macro' }

export interface BundledAgentSkill {
  readonly name: string
  readonly description: string
  readonly byteSize: number
  readonly content: string
}

const skill = buildAgentSkill()

export function resolveAgentSkill(): BundledAgentSkill {
  return skill
}
