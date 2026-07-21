import { appendFile } from 'node:fs/promises'

export interface ReleaseGateInput {
  readonly previousVersion: string
  readonly currentVersion: string
  readonly registryStatus: number
  readonly registryVersion?: string
}

export interface ReleaseGateResult {
  readonly publish: boolean
  readonly version: string
}

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

interface ParsedSemver {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly string[]
}

function parseSemver(version: string): ParsedSemver {
  const match = semverPattern.exec(version)
  if (match === null) {
    throw new TypeError(`${version} is not a valid semantic version`)
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  }
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  for (const field of ['major', 'minor', 'patch'] as const) {
    if (left[field] !== right[field]) return left[field] - right[field]
  }
  if (left.prerelease.length === 0) return right.prerelease.length === 0 ? 0 : 1
  if (right.prerelease.length === 0) return -1
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index]
    const rightIdentifier = right.prerelease[index]
    if (leftIdentifier === undefined) return -1
    if (rightIdentifier === undefined) return 1
    if (leftIdentifier === rightIdentifier) continue
    const leftNumeric = /^\d+$/.test(leftIdentifier)
    const rightNumeric = /^\d+$/.test(rightIdentifier)
    if (leftNumeric && rightNumeric) {
      return Number(leftIdentifier) - Number(rightIdentifier)
    }
    if (leftNumeric) return -1
    if (rightNumeric) return 1
    return leftIdentifier < rightIdentifier ? -1 : 1
  }
  return 0
}

export function evaluateReleaseGate(
  input: ReleaseGateInput,
): ReleaseGateResult {
  const current = parseSemver(input.currentVersion)
  const previous = parseSemver(input.previousVersion)
  if (input.registryStatus === 200) {
    if (input.registryVersion !== input.currentVersion) {
      throw new Error('npm registry did not confirm exact version')
    }
    return { publish: false, version: input.currentVersion }
  }
  if (input.registryStatus !== 404) {
    throw new Error(`Unexpected npm registry response ${input.registryStatus}`)
  }
  const comparison = compareSemver(current, previous)
  if (comparison === 0) {
    return { publish: false, version: input.currentVersion }
  }
  if (comparison < 0) {
    throw new Error(
      'CLI version must be strictly greater than the previous version',
    )
  }
  return { publish: true, version: input.currentVersion }
}

async function exactRegistryVersion(
  version: string,
): Promise<{ readonly status: number; readonly version?: string }> {
  const response = await fetch(
    `https://registry.npmjs.org/ctxindex/${encodeURIComponent(version)}`,
    { headers: { Accept: 'application/json' }, redirect: 'error' },
  )
  if (response.status === 404) return { status: 404 }
  if (response.status !== 200) return { status: response.status }
  const document = (await response.json()) as {
    readonly name?: unknown
    readonly version?: unknown
  }
  if (document.name !== 'ctxindex' || typeof document.version !== 'string') {
    throw new Error('npm registry did not confirm exact version')
  }
  return { status: 200, version: document.version }
}

async function manifestAtRevision(
  revision: string,
): Promise<{ version?: unknown }> {
  const child = Bun.spawn(
    ['git', 'show', `${revision}:apps/cli/package.json`],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`Could not read previous CLI manifest: ${stderr}`)
  }
  return JSON.parse(stdout) as { version?: unknown }
}

async function writeOutputs(result: ReleaseGateResult): Promise<void> {
  const output = process.env.GITHUB_OUTPUT
  if (output === undefined) return
  await appendFile(
    output,
    `publish=${String(result.publish)}\nversion=${result.version}\n`,
  )
}

async function main(args: readonly string[]): Promise<number> {
  const [command, argument] = args
  if (command === 'gate' && argument !== undefined) {
    const currentManifest = (await Bun.file(
      'apps/cli/package.json',
    ).json()) as {
      readonly version?: unknown
    }
    const previousManifest = await manifestAtRevision(argument)
    if (
      typeof currentManifest.version !== 'string' ||
      typeof previousManifest.version !== 'string'
    ) {
      throw new TypeError('CLI manifests must contain string versions')
    }
    const registry = await exactRegistryVersion(currentManifest.version)
    const result = evaluateReleaseGate({
      previousVersion: previousManifest.version,
      currentVersion: currentManifest.version,
      registryStatus: registry.status,
      ...(registry.version === undefined
        ? {}
        : { registryVersion: registry.version }),
    })
    await writeOutputs(result)
    console.log(
      result.publish
        ? `ctxindex@${result.version} is eligible for publication`
        : `ctxindex@${result.version} is unchanged or already exists; skipping publication`,
    )
    return 0
  }
  if (command === 'assert-absent' && argument !== undefined) {
    parseSemver(argument)
    const registry = await exactRegistryVersion(argument)
    if (registry.status === 200) {
      throw new Error(`ctxindex@${argument} appeared before publication`)
    }
    if (registry.status !== 404) {
      throw new Error(`Unexpected npm registry response ${registry.status}`)
    }
    console.log(`ctxindex@${argument} remains unpublished`)
    return 0
  }
  console.error(
    'usage: release-gate.ts gate <previous-sha> | assert-absent <version>',
  )
  return 2
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
