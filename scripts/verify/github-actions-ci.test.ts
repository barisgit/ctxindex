import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

interface WorkflowStep {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

interface Workflow {
  concurrency?: Record<string, unknown>
  jobs?: Record<string, { steps?: WorkflowStep[]; 'timeout-minutes'?: number }>
  on?: Record<string, unknown>
  permissions?: Record<string, unknown>
}

function extractCiGates(source: string) {
  return [...source.matchAll(/^run_gate ([\w-]+) (.+)$/gm)].map(
    ([, name, invocation]) => {
      if (!name || !invocation) {
        throw new Error('invalid run_gate declaration')
      }

      const helper = invocation.match(/^([A-Za-z_][A-Za-z0-9_]*)$/)?.[1]
      if (!helper) return { name, run: invocation }

      const escapedHelper = helper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const body = source.match(
        new RegExp(`^${escapedHelper}\\(\\) \\{\\n([\\s\\S]*?)^\\}`, 'm'),
      )?.[1]
      const command = body?.match(
        /^\s*if (.+?) >"\$output_file" 2>&1; then$/m,
      )?.[1]
      if (!command) {
        throw new Error(`cannot resolve ci.sh gate helper: ${helper}`)
      }
      return { name, run: command }
    },
  )
}

test('pull request CI exposes the pinned, least-privilege repository gates', async () => {
  const [workflowSource, ciSource] = await Promise.all([
    readFile(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    ),
    readFile(new URL('./ci.sh', import.meta.url), 'utf8'),
  ])
  const workflow = Bun.YAML.parse(workflowSource) as Workflow
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
  expect(workflow.jobs?.ci?.['timeout-minutes']).toBe(20)
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
  const ciGates = extractCiGates(ciSource)
  expect(
    steps.flatMap((step) =>
      step.run && step.name !== 'Add local binaries to PATH'
        ? [{ name: step.name, run: step.run }]
        : [],
    ),
  ).toEqual(ciGates)
  expect(ciGates[0]).toEqual({
    name: 'install',
    run: 'bun install --frozen-lockfile',
  })
  expect(steps.some((step) => step.run?.includes('bun run ci'))).toBe(false)
})
