import { expect, test } from 'bun:test'

test('library workflow independently publishes exact trusted artifacts', async () => {
  const [workflow, gate, rootManifest] = await Promise.all([
    Bun.file('.github/workflows/publish-packages.yml').text(),
    Bun.file('scripts/release/library-release-gate.ts').text(),
    Bun.file('package.json').json() as Promise<{
      readonly scripts?: Readonly<Record<string, string>>
    }>,
  ])

  expect(workflow).toContain('branches: [main]')
  expect(workflow).toContain('github.event.before')
  expect(workflow).toContain('library-release-gate.ts discover')
  expect(workflow).toContain("if: needs.gate.outputs.publish == 'true'")
  expect(workflow).toContain('Build, pack, verify, and smoke exact artifact')
  expect(workflow).toContain('Upload exact artifacts')
  expect(workflow).toContain('Download exact artifact')
  expect(workflow).toContain('node-version: 24')
  expect(workflow).toContain('npm install --global npm@11.5.1')
  expect(workflow).toContain('environment: npm-production')
  expect(workflow).toContain('id-token: write')
  expect(workflow).toContain(
    'library-release-gate.ts publish "$RELEASE_MATRIX" dist/npm/publish',
  )
  expect(workflow).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|npm-token|--otp/)
  expect(workflow).not.toMatch(/gh release|github-release|contents: write/)
  expect(workflow).not.toMatch(/uses:\s+[^\n]+@(v|main|master)\b/)

  for (const contract of [
    {
      packageName: '@ctxindex/extension-sdk',
      prepareScript: 'prepare:extension-sdk-release',
      archivePrefix: 'ctxindex-extension-sdk',
    },
    {
      packageName: '@ctxindex/profiles',
      prepareScript: 'prepare:profiles-release',
      archivePrefix: 'ctxindex-profiles',
    },
  ]) {
    expect(gate).toContain(`packageName: '${contract.packageName}'`)
    expect(gate).toContain(`prepareScript: '${contract.prepareScript}'`)
    expect(gate).toContain(`archivePrefix: '${contract.archivePrefix}'`)
    expect(rootManifest.scripts?.[contract.prepareScript]).toBeDefined()
  }
  expect(gate.indexOf("id: 'extension-sdk'")).toBeLessThan(
    gate.indexOf("id: 'profiles'"),
  )
  expect(gate).toContain("['npm', 'publish', archive, '--access', 'public']")

  const artifact = workflow.slice(
    workflow.indexOf('\n  artifact:\n'),
    workflow.indexOf('\n  publish:\n'),
  )
  expect(artifact).toContain('bun install --frozen-lockfile')
  expect(artifact).toContain('library-release-gate.ts prepare')
  expect(artifact).not.toContain('id-token: write')
  expect(artifact).not.toContain('npm install --global')

  const publish = workflow.slice(workflow.indexOf('\n  publish:\n'))
  expect(publish).toContain('id-token: write')
  expect(publish).not.toContain('contents: write')
  expect(publish).not.toContain('bun install --frozen-lockfile')
  expect(publish).not.toContain('library-release-gate.ts prepare')
  expect(publish).not.toContain('actions/cache@')
})
