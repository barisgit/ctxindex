import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function resolveBundledSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const skillsDir = resolve(here, '../../../../skills')

  if (!existsSync(skillsDir)) {
    throw new Error(
      `Bundled skills directory not found at ${skillsDir}. Reinstall ctxindex or run from a complete checkout.`,
    )
  }

  return skillsDir
}
