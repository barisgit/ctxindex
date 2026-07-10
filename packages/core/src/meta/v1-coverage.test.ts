import { expect, test } from 'bun:test'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

interface V1CoverageEntry {
  readonly criterionNumber: number
  readonly label: string
  readonly testFilePath: string
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

const v1Coverage: readonly V1CoverageEntry[] = [
  {
    criterionNumber: 1,
    label: 'bun cli produces a working ctxindex binary',
    testFilePath: 'scripts/verify/cli.sh',
  },
  {
    criterionNumber: 2,
    label: 'init creates XDG layout and seeded state',
    testFilePath: 'apps/cli/src/e2e/init.e2e.test.ts',
  },
  {
    criterionNumber: 3,
    label: 'Gmail sync runs end-to-end with grants and attachments',
    testFilePath: 'apps/cli/src/e2e/gmail-autonomous.e2e.test.ts',
  },
  {
    criterionNumber: 4,
    label: 'local.directory source sync indexes a real source tree',
    testFilePath: 'apps/cli/src/e2e/sync-local.e2e.test.ts',
  },
  {
    criterionNumber: 5,
    label: 'search returns ranked filtered results with explain/json',
    testFilePath: 'apps/cli/src/e2e/search.e2e.test.ts',
  },
  {
    criterionNumber: 6,
    label: 'crashed sync releases locks and preserves state',
    testFilePath: 'apps/cli/src/e2e/crash-recovery.e2e.test.ts',
  },
  {
    criterionNumber: 7,
    label: 'reauth exits 10 and recovers after auth add',
    testFilePath: 'apps/cli/src/e2e/reauth.e2e.test.ts',
  },
  {
    criterionNumber: 8,
    label: 'logs rotate without access or refresh token leaks',
    testFilePath: 'apps/cli/src/e2e/logs.e2e.test.ts',
  },
  {
    criterionNumber: 9,
    label: 'skills list/get/path work from the bundled binary',
    testFilePath: 'apps/cli/src/e2e/skills.e2e.test.ts',
  },
  {
    criterionNumber: 10,
    label: 'network egress remains inside provider allowlist',
    testFilePath: 'apps/cli/src/e2e/network-egress.e2e.test.ts',
  },
  {
    criterionNumber: 11,
    label: 'source add realm behavior is non-interactive',
    testFilePath: 'apps/cli/src/e2e/source.e2e.test.ts',
  },
  {
    criterionNumber: 12,
    label: 'headless auth-code OAuth completes without browser',
    testFilePath: 'apps/cli/src/e2e/oauth-headless.e2e.test.ts',
  },
  {
    criterionNumber: 13,
    label: 'loopback OAuth listener captures code and times out',
    testFilePath: 'apps/cli/src/e2e/oauth-loopback.e2e.test.ts',
  },
  {
    criterionNumber: 14,
    label: 'binary-spawn meta coverage maps every V1 criterion',
    testFilePath: 'packages/core/src/meta/v1-coverage.test.ts',
  },
]

function absolutePath(entry: V1CoverageEntry): string {
  return join(repoRoot, entry.testFilePath)
}

async function fileExists(entry: V1CoverageEntry): Promise<boolean> {
  return Bun.file(absolutePath(entry)).exists()
}

async function readEntry(entry: V1CoverageEntry): Promise<string> {
  if (!(await fileExists(entry))) {
    throw new Error(
      `criterion ${entry.criterionNumber} file missing: ${entry.testFilePath}`,
    )
  }

  return Bun.file(absolutePath(entry)).text()
}

function tsEntries(
  entries: readonly V1CoverageEntry[],
): readonly V1CoverageEntry[] {
  return entries.filter(
    (entry) =>
      entry.testFilePath.endsWith('.ts') && entry.criterionNumber !== 14,
  )
}

function shEntries(
  entries: readonly V1CoverageEntry[],
): readonly V1CoverageEntry[] {
  return entries.filter((entry) => entry.testFilePath.endsWith('.sh'))
}

async function assertEachCriterionMapsToFile(
  entries: readonly V1CoverageEntry[],
): Promise<void> {
  for (const entry of entries) {
    if (!(await fileExists(entry))) {
      throw new Error(
        `criterion ${entry.criterionNumber} file missing: ${entry.testFilePath}`,
      )
    }
  }
}

function containsBinarySpawnProof(source: string): boolean {
  if (/\bBun\.spawn\s*\(/.test(source)) return true

  return /\bcreateSandbox\b/.test(source) && /\bsandbox\.run\s*\(/.test(source)
}

function hasNonCommentedCtxindexInvocation(source: string): boolean {
  return source.split('\n').some((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return false

    return (
      /(^|[;&|($\s])ctxindex\s+(?:--|[A-Za-z0-9_-]+)/.test(trimmed) ||
      /(^|[;&|($\s])bun\s+apps\/cli\/bin\/ctxindex\.mjs(?:\s|$)/.test(trimmed)
    )
  })
}

async function expectFailure(
  promise: Promise<unknown>,
  message: RegExp,
): Promise<void> {
  let caught: unknown
  try {
    await promise
  } catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(Error)
  expect((caught as Error).message).toMatch(message)
}

test('each criterion maps to file', async () => {
  expect(v1Coverage).toHaveLength(14)
  expect(v1Coverage.map((entry) => entry.criterionNumber)).toEqual(
    Array.from({ length: 14 }, (_, index) => index + 1),
  )

  await assertEachCriterionMapsToFile(v1Coverage)
})

test('ts files contain Bun.spawn', async () => {
  const entries = tsEntries(v1Coverage)
  expect(entries.length).toBeGreaterThan(0)

  for (const entry of entries) {
    const source = await readEntry(entry)
    expect(
      containsBinarySpawnProof(source),
      `criterion ${entry.criterionNumber} ${entry.testFilePath} lacks Bun.spawn or sandbox.run from createSandbox`,
    ).toBe(true)
  }
})

test('sh files invoke ctxindex', async () => {
  const entries = shEntries(v1Coverage)
  expect(entries.length).toBeGreaterThan(0)

  for (const entry of entries) {
    const source = await readEntry(entry)
    expect(
      hasNonCommentedCtxindexInvocation(source),
      `criterion ${entry.criterionNumber} ${entry.testFilePath} lacks a non-commented ctxindex invocation`,
    ).toBe(true)
  }
})

test('missing test file fails', async () => {
  await expectFailure(
    assertEachCriterionMapsToFile([
      {
        criterionNumber: 4,
        label: 'synthetic missing source tree coverage',
        testFilePath: 'apps/cli/src/e2e/missing-v1-coverage.e2e.test.ts',
      },
    ]),
    /criterion 4 file missing: apps\/cli\/src\/e2e\/missing-v1-coverage\.e2e\.test\.ts/,
  )
})

test('criterion 14 self reference', async () => {
  const entry = v1Coverage.find((item) => item.criterionNumber === 14)
  expect(entry).toBeDefined()

  const selfRelativePath = relative(repoRoot, fileURLToPath(import.meta.url))
    .split(sep)
    .join('/')

  expect(entry?.testFilePath).toBe(selfRelativePath)
  expect(entry?.label).toContain('meta coverage')
})
