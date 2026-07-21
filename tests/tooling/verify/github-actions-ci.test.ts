import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

interface WorkflowStep {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

interface WorkflowJob {
  name?: string
  steps?: WorkflowStep[]
  'timeout-minutes'?: number
}

interface Workflow {
  concurrency?: Record<string, unknown>
  jobs?: Record<string, WorkflowJob>
  on?: Record<string, unknown>
  permissions?: Record<string, unknown>
}

const checkoutAction =
  'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'
const setupBunAction =
  'oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76'
const cacheAction = 'actions/cache@5a3ec84eff668545956fd18022155c47e93e2684'

function expectLane(
  workflow: Workflow,
  jobName: string,
  displayName: string,
  command: string,
  timeout: number,
): void {
  const job = workflow.jobs?.[jobName]
  const steps = job?.steps ?? []
  const checkout = steps.find((step) => step.uses === checkoutAction)
  const setupBun = steps.find((step) => step.uses === setupBunAction)
  const cache = steps.find((step) => step.uses === cacheAction)

  expect(job?.name).toBe(displayName)
  expect(job?.['timeout-minutes']).toBe(timeout)
  expect(steps.flatMap((step) => (step.uses ? [step.uses] : []))).toEqual([
    checkoutAction,
    setupBunAction,
    cacheAction,
  ])
  expect(checkout?.with?.['persist-credentials']).toBe(false)
  expect(setupBun?.with?.['bun-version']).toBe('1.3.14')
  expect(cache?.with?.path).toContain('~/.bun/install/cache')
  expect(cache?.with?.path).toContain('.turbo')
  expect(cache?.with?.key).toContain('hashFiles(')
  expect(steps.map((step) => step.run).filter(Boolean)).toEqual([
    'bun install --frozen-lockfile',
    command,
  ])
  expect(
    steps
      .filter((step) => step.uses)
      .every((step) => /^[^@]+@[0-9a-f]{40}$/.test(step.uses ?? '')),
  ).toBe(true)
}

test('pull request CI runs cached fast, integration, and E2E lanes in parallel', async () => {
  const workflowSource = await readFile(
    new URL('../../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  )
  const workflow = Bun.YAML.parse(workflowSource) as Workflow
  const pullRequest = workflow.on?.pull_request as
    | { branches?: unknown[] }
    | undefined

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
  expect(Object.keys(workflow.jobs ?? {})).toEqual(['ci', 'integration', 'e2e'])

  expectLane(workflow, 'ci', 'Fast repository gate', 'bun run ci', 20)
  expectLane(
    workflow,
    'integration',
    'Integration tests',
    'bun run test:integration',
    10,
  )
  expectLane(
    workflow,
    'e2e',
    'CLI and daemon E2E tests',
    'bun run test:e2e',
    20,
  )

  for (const job of Object.values(workflow.jobs ?? {})) {
    expect('needs' in job).toBe(false)
  }
})
