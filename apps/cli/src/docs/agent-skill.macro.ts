import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface EmbeddedAgentSkill {
  readonly name: string
  readonly description: string
  readonly byteSize: number
  readonly content: string
}

const frontmatterPattern =
  /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n\n([\s\S]+)$/

export function buildAgentSkill(): EmbeddedAgentSkill {
  const path = resolve(import.meta.dir, '../../../../skills/ctxindex/SKILL.md')
  const bytes = readFileSync(path)
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const match = frontmatterPattern.exec(content)
  const name = match?.[1]
  const description = match?.[2]
  const body = match?.[3]
  if (!name || !description || !body?.trim()) {
    throw new Error(
      'skills/ctxindex/SKILL.md must contain exact name and description frontmatter plus a non-empty body',
    )
  }
  return Object.freeze({
    name,
    description,
    byteSize: bytes.byteLength,
    content,
  })
}
