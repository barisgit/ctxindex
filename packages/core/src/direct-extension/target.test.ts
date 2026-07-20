import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  parseDirectExtensionTarget,
  sanitizeDirectExtensionTarget,
  validateDirectPackageTarget,
} from './target'

describe('direct Extension target parsing', () => {
  test('keeps target kinds explicit and delegates npm and Git grammar', () => {
    const seen: Array<{ kind: string; target: string }> = []
    const parse = (kind: 'npm' | 'git', target: string) => {
      seen.push({ kind, target })
      if (target === 'bad') throw new TypeError('bad package target')
    }

    expect(
      parseDirectExtensionTarget('npm', '@example/mail@^2', {
        cwd: '/workspace',
        validatePackageTarget: parse,
      }),
    ).toEqual({ kind: 'npm', requestedTarget: '@example/mail@^2' })
    expect(
      parseDirectExtensionTarget('git', 'git+https://example.com/mail.git#v2', {
        cwd: '/workspace',
        validatePackageTarget: parse,
      }),
    ).toEqual({
      kind: 'git',
      requestedTarget: 'git+https://example.com/mail.git#v2',
    })
    expect(seen).toEqual([
      { kind: 'npm', target: '@example/mail@^2' },
      { kind: 'git', target: 'git+https://example.com/mail.git#v2' },
    ])
    expect(() =>
      parseDirectExtensionTarget('npm', 'bad', {
        cwd: '/workspace',
        validatePackageTarget: parse,
      }),
    ).toThrow('Invalid npm Extension target')
  })

  test('normalizes a local origin once and independently of later cwd', () => {
    const first = parseDirectExtensionTarget('local', '../fixture', {
      cwd: '/workspace/project',
      validatePackageTarget: validateDirectPackageTarget,
    })
    expect(first).toEqual({
      kind: 'local',
      requestedTarget: resolve('/workspace/project', '../fixture'),
      originPath: resolve('/workspace/project', '../fixture'),
    })
    expect(
      parseDirectExtensionTarget('local', first.requestedTarget, {
        cwd: '/elsewhere',
        validatePackageTarget: validateDirectPackageTarget,
      }),
    ).toEqual(first)
  })

  test.each([
    ['npm', 'https://user:secret@example.com/pkg.tgz'],
    ['git', 'git+https://token@example.com/repo.git'],
    ['git', 'ssh://user@example.com/repo.git'],
    ['git', 'git+ssh://git:secret@example.com/repo.git'],
    ['git', 'user@example.com:repo.git'],
  ] as const)('rejects embedded credentials for %s targets', (kind, target) => {
    expect(() =>
      parseDirectExtensionTarget(kind, target, {
        cwd: '/workspace',
        validatePackageTarget() {},
      }),
    ).toThrow('must not contain credentials')
  })

  test.each([
    'git+ssh://git@example.com/repository.git#main',
    'git@example.com:repository.git#main',
  ])('accepts credential-free Git SSH target %s', (target) => {
    expect(
      parseDirectExtensionTarget('git', target, {
        cwd: '/workspace',
        validatePackageTarget: validateDirectPackageTarget,
      }),
    ).toEqual({ kind: 'git', requestedTarget: target })
  })

  test('sanitizes requested target projection', () => {
    expect(
      sanitizeDirectExtensionTarget({
        kind: 'npm',
        requestedTarget: '@example/mail@^2',
      }),
    ).toEqual({ kind: 'npm', requestedTarget: '@example/mail@^2' })
  })

  test('rejects targets classified as the wrong package source kind', () => {
    expect(() =>
      validateDirectPackageTarget(
        'npm',
        'git+https://example.com/repository.git#main',
      ),
    ).toThrow('Invalid npm package target')
    expect(() =>
      validateDirectPackageTarget('git', '@example/mail@^2'),
    ).toThrow('Invalid Git package target')
    expect(() =>
      validateDirectPackageTarget('npm', 'fixture@../local'),
    ).toThrow('Invalid npm package target')
    expect(() =>
      validateDirectPackageTarget(
        'git',
        'git+ssh://git@github.com/example/repository.git',
      ),
    ).not.toThrow()
    expect(() =>
      validateDirectPackageTarget('git', 'git+file:///tmp/repository#main'),
    ).not.toThrow()
  })
})
