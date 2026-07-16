import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

test('skills list returns bundled skills', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(['skills', 'list'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('getting-started')
    expect(result.stdout).not.toContain('reference/cli-overview')
  } finally {
    await sandbox.cleanup()
  }
})

test('skills get returns markdown', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(['skills', 'get', 'getting-started'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toMatch(/^# Getting started with ctxindex/m)
  } finally {
    await sandbox.cleanup()
  }
})

test('skills path resolves bundled dir', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(['skills', 'path'])
    const skillsPath = result.stdout.trim()

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(isAbsolute(skillsPath)).toBe(true)
    expect(existsSync(skillsPath)).toBe(true)
  } finally {
    await sandbox.cleanup()
  }
})

test('unknown skill name exits 2', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(['skills', 'get', 'nonexistent'])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('nonexistent')
  } finally {
    await sandbox.cleanup()
  }
})

test('inline flag inlines references', async () => {
  const sandbox = await createSandbox()
  try {
    const normal = await sandbox.run(['skills', 'get', 'getting-started'])
    const inline = await sandbox.run([
      'skills',
      'get',
      'getting-started',
      '--inline',
    ])

    expect(normal.exitCode).toBe(0)
    expect(inline.exitCode).toBe(0)
    expect(inline.stderr).toBe('')
    expect(inline.stdout.length).toBeGreaterThan(normal.stdout.length)
    expect(inline.stdout).toContain('--- inlined: reference/cli-overview ---')
    expect(inline.stdout).toContain('# CLI overview')
  } finally {
    await sandbox.cleanup()
  }
})
