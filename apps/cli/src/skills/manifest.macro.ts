import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

export interface EmbeddedSkillFile {
  readonly path: string
  readonly content: string
}

export function buildBundledSkillsManifest(): EmbeddedSkillFile[] {
  const root = resolve(import.meta.dir, '../../../../skills')
  const files: EmbeddedSkillFile[] = []

  function walk(directory: string): void {
    const entries = readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )

    for (const entry of entries) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push({
          path: relative(root, path).split(sep).join('/'),
          content: readFileSync(path, 'utf8'),
        })
      }
    }
  }

  walk(root)
  return files
}
