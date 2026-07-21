import { appendFile, readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

interface LibraryDefinition {
  readonly id: 'extension-sdk' | 'profiles'
  readonly packageName: '@ctxindex/extension-sdk' | '@ctxindex/profiles'
  readonly manifestPath:
    | 'packages/extension-sdk/package.json'
    | 'packages/profiles/package.json'
  readonly prepareScript:
    | 'prepare:extension-sdk-release'
    | 'prepare:profiles-release'
  readonly archivePrefix: 'ctxindex-extension-sdk' | 'ctxindex-profiles'
}

export interface RegistryResult {
  readonly status: number
  readonly name?: string
  readonly version?: string
}

export interface LibraryGateInput {
  readonly definition: LibraryDefinition
  readonly previousVersion: string
  readonly currentVersion: string
  readonly registry?: RegistryResult
}

export interface LibraryReleaseCandidate {
  readonly id: LibraryDefinition['id']
  readonly packageName: LibraryDefinition['packageName']
  readonly version: string
  readonly prepareScript: LibraryDefinition['prepareScript']
  readonly archive: string
  readonly archiveName: string
}

export interface LibraryReleaseMatrix {
  readonly include: readonly LibraryReleaseCandidate[]
}

export interface LibraryPublishPreflightInput {
  readonly candidate: LibraryReleaseCandidate
  readonly registry: RegistryResult
  readonly runAttempt: number
}

const libraries: readonly LibraryDefinition[] = [
  {
    id: 'extension-sdk',
    packageName: '@ctxindex/extension-sdk',
    manifestPath: 'packages/extension-sdk/package.json',
    prepareScript: 'prepare:extension-sdk-release',
    archivePrefix: 'ctxindex-extension-sdk',
  },
  {
    id: 'profiles',
    packageName: '@ctxindex/profiles',
    manifestPath: 'packages/profiles/package.json',
    prepareScript: 'prepare:profiles-release',
    archivePrefix: 'ctxindex-profiles',
  },
]

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function assertSemver(version: string): void {
  if (!semverPattern.test(version)) {
    throw new TypeError(`${version} is not a valid semantic version`)
  }
}

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

export function evaluateLibraryRelease(
  input: LibraryGateInput,
): LibraryReleaseCandidate | null {
  assertSemver(input.previousVersion)
  assertSemver(input.currentVersion)
  if (input.previousVersion === input.currentVersion) return null
  if (
    compareSemver(
      parseSemver(input.currentVersion),
      parseSemver(input.previousVersion),
    ) <= 0
  ) {
    throw new Error('Library version must be strictly greater than before')
  }
  if (input.registry === undefined) {
    throw new Error('Changed package was not checked against npm')
  }
  if (input.registry.status === 200) {
    if (
      input.registry.name !== input.definition.packageName ||
      input.registry.version !== input.currentVersion
    ) {
      throw new Error('npm registry did not confirm exact package version')
    }
    return null
  }
  if (input.registry.status !== 404) {
    throw new Error(
      `Unexpected npm registry response ${input.registry.status} for ${input.definition.packageName}`,
    )
  }
  const archiveName = `${input.definition.archivePrefix}-${input.currentVersion}.tgz`
  return {
    id: input.definition.id,
    packageName: input.definition.packageName,
    version: input.currentVersion,
    prepareScript: input.definition.prepareScript,
    archive: `dist/npm/artifacts/${archiveName}`,
    archiveName,
  }
}

async function exactRegistryVersion(
  definition: LibraryDefinition,
  version: string,
): Promise<RegistryResult> {
  const encodedName = definition.packageName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('%2f')
  const response = await fetch(
    `https://registry.npmjs.org/${encodedName}/${encodeURIComponent(version)}`,
    { headers: { Accept: 'application/json' }, redirect: 'error' },
  )
  if (response.status === 404) return { status: 404 }
  if (response.status !== 200) return { status: response.status }
  let document: unknown
  try {
    document = await response.json()
  } catch {
    throw new Error('npm registry returned malformed JSON')
  }
  if (typeof document !== 'object' || document === null) {
    throw new Error('npm registry did not confirm exact package version')
  }
  const record = document as Record<string, unknown>
  if (typeof record.name !== 'string' || typeof record.version !== 'string') {
    throw new Error('npm registry did not confirm exact package version')
  }
  return { status: 200, name: record.name, version: record.version }
}

async function manifestAtRevision(
  revision: string,
  path: string,
): Promise<{ readonly name?: unknown; readonly version?: unknown }> {
  const child = Bun.spawn(['git', 'show', `${revision}:${path}`], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`Could not read previous manifest ${path}: ${stderr}`)
  }
  return JSON.parse(stdout) as { name?: unknown; version?: unknown }
}

async function currentManifest(
  definition: LibraryDefinition,
): Promise<{ readonly name?: unknown; readonly version?: unknown }> {
  return Bun.file(definition.manifestPath).json() as Promise<{
    readonly name?: unknown
    readonly version?: unknown
  }>
}

async function discover(previousRevision: string): Promise<{
  readonly include: readonly LibraryReleaseCandidate[]
}> {
  const include: LibraryReleaseCandidate[] = []
  for (const definition of libraries) {
    const [previous, current] = await Promise.all([
      manifestAtRevision(previousRevision, definition.manifestPath),
      currentManifest(definition),
    ])
    if (
      current.name !== definition.packageName ||
      previous.name !== definition.packageName ||
      typeof current.version !== 'string' ||
      typeof previous.version !== 'string'
    ) {
      throw new TypeError(
        `${definition.manifestPath} must contain the expected name and a string version`,
      )
    }
    const registry =
      current.version === previous.version
        ? undefined
        : await exactRegistryVersion(definition, current.version)
    const candidate = evaluateLibraryRelease({
      definition,
      previousVersion: previous.version,
      currentVersion: current.version,
      ...(registry === undefined ? {} : { registry }),
    })
    if (candidate !== null) include.push(candidate)
  }
  return { include }
}

function libraryForName(packageName: string): LibraryDefinition {
  const definition = libraries.find(
    (candidate) => candidate.packageName === packageName,
  )
  if (definition === undefined) {
    throw new TypeError(`Unsupported library package: ${packageName}`)
  }
  return definition
}

export function parseLibraryReleaseMatrix(
  encoded: string,
): LibraryReleaseMatrix {
  const value = JSON.parse(encoded) as { readonly include?: unknown }
  if (!Array.isArray(value.include)) {
    throw new TypeError('Library release matrix must contain an include array')
  }
  let previousDefinitionIndex = -1
  const include = value.include.map((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) {
      throw new TypeError(
        'Library release matrix contains an invalid candidate',
      )
    }
    const record = candidate as Record<string, unknown>
    const definitionIndex = libraries.findIndex(
      (definition) => definition.id === record.id,
    )
    const definition = libraries[definitionIndex]
    if (
      definition === undefined ||
      definitionIndex <= previousDefinitionIndex
    ) {
      throw new TypeError('Library release matrix is not in dependency order')
    }
    previousDefinitionIndex = definitionIndex
    if (typeof record.version !== 'string') {
      throw new TypeError('Library release candidate version must be a string')
    }
    assertSemver(record.version)
    const archiveName = `${definition.archivePrefix}-${record.version}.tgz`
    const expected: LibraryReleaseCandidate = {
      id: definition.id,
      packageName: definition.packageName,
      version: record.version,
      prepareScript: definition.prepareScript,
      archive: `dist/npm/artifacts/${archiveName}`,
      archiveName,
    }
    if (JSON.stringify(record) !== JSON.stringify(expected)) {
      throw new TypeError(
        'Library release candidate does not match its contract',
      )
    }
    return expected
  })
  return { include }
}

export function evaluateLibraryPublishPreflight(
  input: LibraryPublishPreflightInput,
): 'publish' | 'skip' {
  if (!Number.isSafeInteger(input.runAttempt) || input.runAttempt < 1) {
    throw new TypeError('GitHub run attempt must be a positive integer')
  }
  if (input.registry.status === 404) return 'publish'
  if (input.registry.status !== 200) {
    throw new Error(
      `Unexpected npm registry response ${input.registry.status} for ${input.candidate.packageName}`,
    )
  }
  if (
    input.registry.name !== input.candidate.packageName ||
    input.registry.version !== input.candidate.version
  ) {
    throw new Error('npm registry did not confirm exact package version')
  }
  if (input.runAttempt === 1) {
    throw new Error(
      `${input.candidate.packageName}@${input.candidate.version} appeared before publication`,
    )
  }
  return 'skip'
}

async function runRequired(command: readonly string[]): Promise<void> {
  const child = Bun.spawn([...command], {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed with exit ${exitCode}`)
  }
}

async function prepareCandidates(matrix: LibraryReleaseMatrix): Promise<void> {
  for (const candidate of matrix.include) {
    await runRequired([process.execPath, 'run', candidate.prepareScript])
    for (const path of [candidate.archive, `${candidate.archive}.sha256`]) {
      if (!(await Bun.file(path).exists())) {
        throw new Error(`Package preparation did not create ${path}`)
      }
    }
  }
}

async function assertArtifactChecksum(
  directory: string,
  candidate: LibraryReleaseCandidate,
): Promise<string> {
  const archive = resolve(directory, candidate.archiveName)
  const expected = await readFile(`${archive}.sha256`, 'utf8')
  const match = /^([a-f0-9]{64}) {2}([^\n]+)\n$/.exec(expected)
  if (match === null || match[2] !== basename(archive)) {
    throw new Error(`Malformed checksum for ${candidate.archiveName}`)
  }
  const actual = new Bun.CryptoHasher('sha256')
    .update(await Bun.file(archive).arrayBuffer())
    .digest('hex')
  if (actual !== match[1]) {
    throw new Error(`Checksum mismatch for ${candidate.archiveName}`)
  }
  return archive
}

async function publishCandidates(
  matrix: LibraryReleaseMatrix,
  directory: string,
): Promise<void> {
  const encodedRunAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1'
  if (!/^\d+$/.test(encodedRunAttempt)) {
    throw new TypeError('GitHub run attempt must be a positive integer')
  }
  const runAttempt = Number(encodedRunAttempt)
  for (const candidate of matrix.include) {
    const archive = await assertArtifactChecksum(directory, candidate)
    const definition = libraryForName(candidate.packageName)
    const registry = await exactRegistryVersion(definition, candidate.version)
    const decision = evaluateLibraryPublishPreflight({
      candidate,
      registry,
      runAttempt,
    })
    if (decision === 'skip') {
      console.log(
        `${candidate.packageName}@${candidate.version} already exists from an earlier attempt; continuing`,
      )
      continue
    }
    await runRequired(['npm', 'publish', archive, '--access', 'public'])
  }
}

async function main(args: readonly string[]): Promise<number> {
  const [command, first, second] = args
  if (command === 'discover' && first !== undefined) {
    const matrix = await discover(first)
    const encoded = JSON.stringify(matrix)
    if (process.env.GITHUB_OUTPUT !== undefined) {
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `matrix=${encoded}\npublish=${String(matrix.include.length > 0)}\n`,
      )
    }
    console.log(encoded)
    return 0
  }
  if (command === 'prepare' && first !== undefined) {
    await prepareCandidates(parseLibraryReleaseMatrix(first))
    return 0
  }
  if (command === 'publish' && first !== undefined && second !== undefined) {
    await publishCandidates(parseLibraryReleaseMatrix(first), second)
    return 0
  }
  if (
    command === 'assert-absent' &&
    first !== undefined &&
    second !== undefined
  ) {
    const definition = libraryForName(first)
    assertSemver(second)
    const registry = await exactRegistryVersion(definition, second)
    if (registry.status === 200) {
      if (registry.name !== first || registry.version !== second) {
        throw new Error('npm registry did not confirm exact package version')
      }
      throw new Error(`${first}@${second} appeared before publication`)
    }
    if (registry.status !== 404) {
      throw new Error(
        `Unexpected npm registry response ${registry.status} for ${first}`,
      )
    }
    console.log(`${first}@${second} remains unpublished`)
    return 0
  }
  console.error(
    'usage: library-release-gate.ts discover <previous-sha> | prepare <matrix-json> | publish <matrix-json> <artifact-directory> | assert-absent <package-name> <version>',
  )
  return 2
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2))
