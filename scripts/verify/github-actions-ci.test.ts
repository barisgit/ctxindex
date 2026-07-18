import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

interface WorkflowStep {
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

interface Workflow {
  concurrency?: Record<string, unknown>
  jobs?: Record<string, { steps?: WorkflowStep[] }>
  on?: Record<string, unknown>
  permissions?: Record<string, unknown>
}

test('pull request CI uses the pinned, least-privilege repository gate', async () => {
  const source = await readFile(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  )
  const workflow = Bun.YAML.parse(source) as Workflow
  const pullRequest = workflow.on?.pull_request as
    | { branches?: unknown[] }
    | undefined
  const steps = workflow.jobs?.ci?.steps ?? []
  const checkout = steps.find((step) =>
    step.uses?.startsWith('actions/checkout@'),
  )
  const setupBun = steps.find((step) =>
    step.uses?.startsWith('oven-sh/setup-bun@'),
  )

  expect(Object.keys(workflow.on ?? {})).toEqual(['pull_request'])
  expect(pullRequest?.branches).toEqual(['main'])
  expect(workflow.permissions).toEqual({ contents: 'read' })
  expect(workflow.concurrency).toEqual({
    group:
      '$' +
      '{{ github.workflow }}-$' +
      '{{ github.event.pull_request.number }}',
    'cancel-in-progress': true,
  })
  expect(steps.flatMap((step) => (step.uses ? [step.uses] : []))).toEqual([
    'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
    'oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76',
  ])
  expect(checkout?.with?.['persist-credentials']).toBe(false)
  expect(
    steps
      .filter((step) => step.uses)
      .every((step) => /^[^@]+@[0-9a-f]{40}$/.test(step.uses ?? '')),
  ).toBe(true)
  expect(setupBun?.with?.['bun-version']).toBe('1.3.14')
  expect(
    steps.some((step) => step.run === 'bun install --frozen-lockfile'),
  ).toBe(true)
  expect(steps.some((step) => step.run === 'bun run ci')).toBe(true)
})
