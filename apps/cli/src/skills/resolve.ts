import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SkillsSource } from './loader'
import { buildBundledSkillsManifest } from './manifest.macro' with {
  type: 'macro',
}

const embeddedLocation = 'embedded://ctxindex/skills'
const embeddedFiles = buildBundledSkillsManifest()

export function resolveBundledSkills(): SkillsSource {
  const here = dirname(fileURLToPath(import.meta.url))
  const skillsDir = resolve(here, '../../../../skills')

  if (existsSync(skillsDir)) {
    return { kind: 'filesystem', root: skillsDir, location: skillsDir }
  }

  return {
    kind: 'embedded',
    location: embeddedLocation,
    files: embeddedFiles,
  }
}
