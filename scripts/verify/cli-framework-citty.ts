#!/usr/bin/env bun
import { resolve } from 'node:path'
import { projectCommandReference } from '../../apps/cli/src/command-model'
import { rootCommand, runCli } from '../../apps/cli/src/main'

const repoRoot = resolve(import.meta.dir, '../..')

async function commandSourceFiles(): Promise<readonly string[]> {
  const patterns = [
    'apps/cli/src/commands/**/*.ts',
    'apps/cli/src/daemon/command.ts',
    'apps/cli/src/extensions/command.ts',
  ]
  const paths = new Set<string>()
  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern)
    for await (const path of glob.scan({ cwd: repoRoot, onlyFiles: true })) {
      if (!path.endsWith('.test.ts')) paths.add(path)
    }
  }
  return [...paths].sort()
}

async function validateSourceOwnership(): Promise<readonly string[]> {
  const failures: string[] = []
  for (const path of await commandSourceFiles()) {
    const source = await Bun.file(resolve(repoRoot, path)).text()
    if (/\bdefineCommand\b[\s\S]*from 'citty'/u.test(source)) {
      failures.push(`${path}: import commands through defineCtxCommand`)
    }
    if (/\brawArgs\b/.test(source)) {
      failures.push(`${path}: handlers must consume typed Citty args`)
    }
  }
  return failures
}

async function validateProjection(): Promise<readonly string[]> {
  const failures: string[] = []
  const projection = await projectCommandReference(rootCommand)
  const paths = new Set<string>()
  for (const command of projection.commands) {
    const path = command.path.join(' ')
    if (paths.has(path)) failures.push(`${path}: duplicate command path`)
    paths.add(path)
    if (!command.description?.trim()) {
      failures.push(`${path}: missing description`)
    }
    if (!command.usage.includes(path)) {
      failures.push(`${path}: help omits complete command path`)
    }
  }
  if (projection.commands.length < 2) {
    failures.push('command projection did not discover nested commands')
  }
  return failures
}

async function main(): Promise<number> {
  const failures = [
    ...(await validateSourceOwnership()),
    ...(await validateProjection()),
  ]
  if (failures.length > 0) {
    for (const failure of failures)
      console.error(`cli-framework-citty: ${failure}`)
    return 1
  }

  const log = console.log
  const error = console.error
  console.log = () => {}
  console.error = () => {}
  try {
    if ((await runCli(['--help'])) !== 0) {
      error('cli-framework-citty: root help failed')
      return 1
    }
    if ((await runCli(['definitely-not-a-real-command'])) !== 2) {
      error('cli-framework-citty: unknown command did not return exit 2')
      return 1
    }
  } finally {
    console.log = log
    console.error = error
  }

  console.log('cli-framework-citty: declarative command checks passed')
  return 0
}

process.exit(await main())
