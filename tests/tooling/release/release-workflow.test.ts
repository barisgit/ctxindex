import { expect, test } from 'bun:test'

test('release workflow is a protected tokenless exact-artifact pipeline', async () => {
  const workflow = await Bun.file('.github/workflows/release.yml').text()

  expect(workflow).toContain('branches: [main]')
  expect(workflow).toContain('contents: read')
  expect(workflow).toContain('cancel-in-progress: false')
  expect(workflow).toContain('bun-version: 1.3.14')
  expect(workflow).toContain('github.event.before')
  expect(workflow).toContain('name: Verify, build, pack, and smoke')
  expect(workflow).toContain('name: Build')
  expect(workflow).toContain('name: Pack')
  expect(workflow).toContain('name: Smoke')
  expect(workflow).toContain('name: Publish')
  expect(workflow).toContain('name: Tag and GitHub Release')
  expect(workflow).toContain('environment: npm-production')
  expect(workflow).toContain('id-token: write')
  expect(workflow).toContain('contents: write')
  expect(workflow).toContain('npm publish')
  expect(workflow).toContain('release-gate.ts')
  expect(workflow).toContain('bun run smoke:cli-package')
  expect(workflow).toContain('run: bun run ci')
  expect(workflow).not.toContain('run: bun run test:integration')
  expect(workflow).not.toContain('run: bun run test:e2e')
  expect(workflow).toContain('needs: gate')
  expect(workflow).toContain(
    'actions/cache@5a3ec84eff668545956fd18022155c47e93e2684',
  )
  for (const command of ['bun install --frozen-lockfile', 'bun run ci']) {
    expect(workflow).toContain(`run: ${command}`)
  }
  expect(workflow).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|npm-token/)
  expect(workflow).not.toMatch(/uses:\s+[^\n]+@(v|main|master)\b/)

  const publish = workflow.slice(
    workflow.indexOf('  publish:'),
    workflow.indexOf('  github-release:'),
  )
  expect(publish).toContain('id-token: write')
  expect(publish).not.toContain('contents: write')

  const githubRelease = workflow.slice(workflow.indexOf('  github-release:'))
  expect(githubRelease).toContain('needs: [gate, publish]')
  expect(githubRelease).toContain('contents: write')
  expect(githubRelease).not.toContain('id-token: write')
  expect(githubRelease).toContain('sha256sum --check')
  expect(githubRelease).toContain('git ls-remote --refs origin')
  expect(githubRelease).toContain('existing%%[[:space:]]*')
  expect(githubRelease).toContain('= "$GITHUB_SHA"')
  expect(githubRelease).toContain('gh release create')
  expect(githubRelease).toContain('gh release upload')
  expect(githubRelease).toContain('--verify-tag')
  expect(githubRelease).toContain('--clobber')
})
