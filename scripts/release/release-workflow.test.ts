import { expect, test } from 'bun:test'

test('release workflow is a protected tokenless exact-artifact pipeline', async () => {
  const workflow = await Bun.file('.github/workflows/release.yml').text()

  expect(workflow).toContain('branches: [main]')
  expect(workflow).toContain('contents: read')
  expect(workflow).toContain('cancel-in-progress: false')
  expect(workflow).toContain('bun-version: 1.3.14')
  expect(workflow).toContain('github.event.before')
  expect(workflow).toContain('name: CI')
  expect(workflow).toContain('name: Build')
  expect(workflow).toContain('name: Pack')
  expect(workflow).toContain('name: Smoke')
  expect(workflow).toContain('name: Publish')
  expect(workflow).toContain('environment: npm-production')
  expect(workflow).toContain('id-token: write')
  expect(workflow).toContain('npm publish')
  expect(workflow).toContain('release-gate.ts')
  expect(workflow).toContain('bun run smoke:cli-package')
  expect(workflow).not.toContain('run: bun run ci')
  for (const command of [
    'bun install --frozen-lockfile',
    'biome check .',
    'tsgo --noEmit -p tsconfig.base.json',
    'bun run build',
    'bun run scripts/verify/package-dependencies.ts',
    'bun run scripts/verify/architecture-lint.ts',
    'bun run scripts/verify/cli-no-business-logic.ts',
    'bun run scripts/verify/cli-framework-citty.ts',
    'bun run scripts/verify/cli-thin-lines.ts',
    'bun run scripts/verify/exports-map.ts',
    'bash scripts/verify/full-test-suite.sh',
  ]) {
    expect(workflow).toContain(`run: ${command}`)
  }
  expect(workflow).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|npm-token/)
  expect(workflow).not.toMatch(/uses:\s+[^\n]+@(v|main|master)\b/)
})
