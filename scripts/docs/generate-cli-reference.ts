#!/usr/bin/env bun
import { resolve } from 'node:path'
import { projectCommandReference } from '../../apps/cli/src/command-model'
import { renderCommandReferenceMarkdown } from '../../apps/cli/src/command-reference'
import { createRootCommand } from '../../apps/cli/src/main'

const repoRoot = resolve(import.meta.dir, '../..')
const outputPath = resolve(repoRoot, 'apps/web/content/docs/cli/index.mdx')
const packagePath = resolve(repoRoot, 'apps/cli/package.json')
const manifest = (await Bun.file(packagePath).json()) as { version?: unknown }
if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
  throw new Error('apps/cli/package.json must declare a version')
}
const expected = renderCommandReferenceMarkdown(
  await projectCommandReference(createRootCommand(undefined, manifest.version)),
)
const currentFile = Bun.file(outputPath)
const current = (await currentFile.exists()) ? await currentFile.text() : ''

if (process.argv.includes('--check')) {
  if (current !== expected) {
    console.error('CLI reference is stale. Run: bun run generate:cli-reference')
    process.exit(1)
  }
  console.log('CLI reference is current.')
} else {
  await Bun.write(outputPath, expected)
  console.log(`Generated ${outputPath}`)
}
