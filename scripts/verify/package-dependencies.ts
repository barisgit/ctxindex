#!/usr/bin/env bun
import type { Dirent } from 'node:fs'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import ts from 'typescript'

const sourceExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.source',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
])
const ignoredFrameworkSpecifiers = new Set(['mdx/types'])
const frameworkSpecifierPeers = new Map([
  ['fumadocs-core/source/lucide-icons', ['lucide-react']],
])
const frameworkPackagePeers = new Map([['next', ['react', 'react-dom']]])
const builtins = new Set(
  builtinModules.map((name) => name.replace(/^node:/, '')),
)
const rpcForbiddenBuiltinRoots = new Set([
  'child_process',
  'cluster',
  'fs',
  'process',
  'worker_threads',
])
const rpcForbiddenStoragePackages = new Set([
  'better-sqlite3',
  'drizzle-orm',
  'sqlite3',
])
const rpcAllowedOrpcEntryPoints = new Set(['@orpc/contract', '@orpc/server'])
const localDaemonAllowedBuiltinRoots = new Set(['crypto', 'fs', 'os', 'path'])
const providerHosts = [
  'accounts.google.com',
  'gmail.googleapis.com',
  'graph.microsoft.com',
  'login.microsoftonline.com',
  'oauth2.googleapis.com',
  'openidconnect.googleapis.com',
  'www.googleapis.com',
]
const rawSqlPattern =
  /^\s*(?:INSERT|UPDATE|DELETE|SELECT|CREATE|ALTER|DROP)\s+/i

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function packageNameFromSpecifier(
  specifier: string,
): string | undefined {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#') ||
    specifier === 'bun' ||
    specifier.startsWith('bun:') ||
    specifier.startsWith('node:') ||
    builtins.has(specifier)
  ) {
    return undefined
  }

  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

export function extractPackageImports(
  source: string,
  fileName: string,
  localSpecifierPatterns: readonly string[] = [],
): string[] {
  const imports = new Set<string>()
  for (const specifier of extractModuleSpecifiers(source, fileName)) {
    if (
      ignoredFrameworkSpecifiers.has(specifier) ||
      localSpecifierPatterns.some((pattern) => {
        const wildcard = pattern.indexOf('*')
        if (wildcard === -1) return specifier === pattern
        return (
          specifier.startsWith(pattern.slice(0, wildcard)) &&
          specifier.endsWith(pattern.slice(wildcard + 1))
        )
      })
    )
      continue
    for (const peer of frameworkSpecifierPeers.get(specifier) ?? [])
      imports.add(peer)
    const packageName = packageNameFromSpecifier(specifier)
    if (packageName) imports.add(packageName)
  }
  return [...imports].sort(compareStrings)
}

function extractModuleSpecifiers(source: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  const imports = new Set<string>()

  const addSpecifier = (node: ts.Expression | undefined): void => {
    if (!node || !ts.isStringLiteralLike(node)) return
    imports.add(node.text)
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier)
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      addSpecifier(node.argument.literal)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addSpecifier(node.moduleReference.expression)
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (
        (isDynamicImport && node.arguments.length >= 1) ||
        (isRequire && node.arguments.length === 1)
      )
        addSpecifier(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...imports].sort(compareStrings)
}

function isOutsideDirectory(directory: string, target: string): boolean {
  const relativeTarget = relative(directory, target)
  return (
    relativeTarget === '..' ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget)
  )
}

async function existingImportTargets(
  specifier: string,
  fileName: string,
): Promise<string[]> {
  const target = isAbsolute(specifier)
    ? resolve(specifier)
    : resolve(dirname(fileName), specifier)
  const candidates = extname(target)
    ? [target]
    : [
        target,
        ...[...sourceExtensions].map((extension) => `${target}${extension}`),
        ...[...sourceExtensions].map((extension) =>
          join(target, `index${extension}`),
        ),
      ]
  const targets: string[] = []
  for (const candidate of candidates) {
    try {
      const physicalTarget = await realpath(candidate)
      if ((await stat(physicalTarget)).isFile()) targets.push(physicalTarget)
    } catch {
      // Missing candidates are handled by lexical containment.
    }
  }
  return targets
}

async function isLocalPackageEscape(
  specifier: string,
  fileName: string,
  packageDirectory: string,
  physicalPackageDirectory: string,
): Promise<boolean> {
  if (!specifier.startsWith('.') && !isAbsolute(specifier)) return false
  const lexicalTarget = isAbsolute(specifier)
    ? resolve(specifier)
    : resolve(dirname(fileName), specifier)
  if (isOutsideDirectory(resolve(packageDirectory), lexicalTarget)) return true
  return (await existingImportTargets(specifier, fileName)).some((target) =>
    isOutsideDirectory(physicalPackageDirectory, target),
  )
}

async function extractRpcBoundaryUses(
  source: string,
  fileName: string,
  packageDirectory: string,
  physicalPackageDirectory: string,
  applicationPackages: ReadonlySet<string>,
): Promise<string[]> {
  const uses = new Set<string>()
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  )

  for (const specifier of extractModuleSpecifiers(source, fileName)) {
    const packageName = packageNameFromSpecifier(specifier)
    const builtinRoot = specifier.replace(/^node:/, '').split('/')[0]
    if (
      packageName === '@ctxindex/core' ||
      packageName === '@ctxindex/official' ||
      packageName === '@ctxindex/local-daemon' ||
      (packageName !== undefined && applicationPackages.has(packageName))
    )
      uses.add(packageName)
    if (
      (await isLocalPackageEscape(
        specifier,
        fileName,
        packageDirectory,
        physicalPackageDirectory,
      )) ||
      (specifier.startsWith('@orpc/') &&
        !rpcAllowedOrpcEntryPoints.has(specifier)) ||
      specifier === 'bun' ||
      (specifier.startsWith('bun:') && specifier !== 'bun:test') ||
      rpcForbiddenBuiltinRoots.has(builtinRoot) ||
      (packageName !== undefined &&
        rpcForbiddenStoragePackages.has(packageName)) ||
      /(?:^|\/)apps\//.test(specifier) ||
      /(?:^|\/)(?:format|formatter|formatters)(?:\/|$)/.test(specifier)
    )
      uses.add(specifier)
  }

  for (const use of extractForbiddenRuntimeUses(sourceFile)) uses.add(use)

  return [...uses].sort(compareStrings)
}

async function extractLocalDaemonBoundaryUses(
  source: string,
  fileName: string,
  packageDirectory: string,
  physicalPackageDirectory: string,
  applicationPackages: ReadonlySet<string>,
): Promise<string[]> {
  const uses = new Set<string>()
  const allowTestRuntimePrimitives = isRuntimeTestSupportFile(fileName)
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  )

  for (const specifier of extractModuleSpecifiers(source, fileName)) {
    if (specifier === 'bun:test') continue
    const packageName = packageNameFromSpecifier(specifier)
    const builtinRoot = specifier.replace(/^node:/, '').split('/')[0]
    const allowedTestProcessImport =
      allowTestRuntimePrimitives && builtinRoot === 'process'
    const allowedLeaseChildProcessImport =
      relative(packageDirectory, fileName).replaceAll('\\', '/') ===
        'src/lease.ts' && builtinRoot === 'child_process'
    if (packageName !== undefined)
      uses.add(
        rpcForbiddenStoragePackages.has(packageName) ? specifier : packageName,
      )
    if (
      (await isLocalPackageEscape(
        specifier,
        fileName,
        packageDirectory,
        physicalPackageDirectory,
      )) ||
      (specifier === 'bun' && !allowTestRuntimePrimitives) ||
      specifier.startsWith('bun:') ||
      (packageName === undefined &&
        !specifier.startsWith('.') &&
        !specifier.startsWith('/') &&
        !specifier.startsWith('#') &&
        !localDaemonAllowedBuiltinRoots.has(builtinRoot) &&
        !allowedTestProcessImport &&
        !allowedLeaseChildProcessImport) ||
      (packageName !== undefined && applicationPackages.has(packageName)) ||
      /(?:^|\/)apps\//.test(specifier) ||
      /(?:^|\/)(?:format|formatter|formatters)(?:\/|$)/.test(specifier)
    )
      uses.add(specifier)
  }

  for (const use of extractForbiddenRuntimeUses(
    sourceFile,
    allowTestRuntimePrimitives,
  ))
    uses.add(use)

  return [...uses].sort(compareStrings)
}

function isRuntimeTestSupportFile(fileName: string): boolean {
  const normalized = fileName.replaceAll('\\', '/')
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    normalized.includes('/src/testing/')
  )
}

function extractForbiddenRuntimeUses(
  sourceFile: ts.SourceFile,
  allowBunAndProcess = false,
): string[] {
  const uses = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Bun' &&
      !allowBunAndProcess
    ) {
      uses.add(`Bun.${node.name.text}`)
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'fetch'
    ) {
      uses.add('fetch')
    } else if (
      ts.isIdentifier(node) &&
      node.text === 'process' &&
      !allowBunAndProcess
    ) {
      uses.add('process')
    } else if (ts.isStringLiteralLike(node)) {
      if (rawSqlPattern.test(node.text)) uses.add('raw-sql')
      for (const host of providerHosts) {
        if (node.text.includes(host)) uses.add(`provider-url:${host}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...uses].sort(compareStrings)
}

interface PackageJson {
  name: string
  private?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

interface RootPackageJson {
  workspaces?: string[] | { packages?: string[] }
}

interface TsConfig {
  compilerOptions?: {
    baseUrl?: string
    paths?: Record<string, string[]>
  }
}

export interface WorkspacePackage {
  name: string
  directory: string
  manifest: PackageJson
  files: string[]
}

async function isNestedPackageRoot(directory: string): Promise<boolean> {
  try {
    await readFile(join(directory, 'package.json'), 'utf8')
    return true
  } catch {
    return false
  }
}

async function discoverSourceFiles(
  directory: string,
  packageRoot = directory,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries.sort((left, right) =>
    compareStrings(left.name, right.name),
  )) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (
        !ignoredDirectories.has(entry.name) &&
        (path === packageRoot || !(await isNestedPackageRoot(path)))
      )
        files.push(...(await discoverSourceFiles(path, packageRoot)))
      continue
    }
    if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      sourceExtensions.has(extname(entry.name))
    )
      files.push(path)
  }

  return files
}

function isWorkspaceLocalTarget(
  directory: string,
  baseDirectory: string,
  target: string,
): boolean {
  const resolvedTarget = resolve(
    baseDirectory,
    target.replace('*', '__alias_target__'),
  )
  const relativeTarget = relative(directory, resolvedTarget)
  return (
    relativeTarget !== '..' &&
    !relativeTarget.startsWith(`..${sep}`) &&
    !isAbsolute(relativeTarget) &&
    !relativeTarget.split(sep).includes('node_modules')
  )
}

async function readLocalSpecifierPatterns(
  directory: string,
): Promise<string[]> {
  let config: TsConfig
  try {
    const configPath = join(directory, 'tsconfig.json')
    const parsed = ts.parseConfigFileTextToJson(
      configPath,
      await readFile(configPath, 'utf8'),
    )
    if (parsed.error || !parsed.config) return []
    config = parsed.config as TsConfig
  } catch {
    return []
  }
  const baseDirectory = resolve(
    directory,
    config.compilerOptions?.baseUrl ?? '.',
  )

  return Object.entries(config.compilerOptions?.paths ?? {})
    .filter(
      ([, targets]) =>
        targets.length > 0 &&
        targets.every((target) =>
          isWorkspaceLocalTarget(directory, baseDirectory, target),
        ),
    )
    .map(([pattern]) => pattern)
    .sort(compareStrings)
}

function addDeclaredFrameworkPeers(
  imports: Set<string>,
  declared: ReadonlySet<string>,
): void {
  for (const dependency of [...imports]) {
    if (!declared.has(dependency)) continue
    for (const peer of frameworkPackagePeers.get(dependency) ?? [])
      if (declared.has(peer)) imports.add(peer)
  }
}

export async function discoverWorkspacePackages(
  root: string,
): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = []
  const rootManifest: RootPackageJson = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  )
  const workspacePatterns = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : (rootManifest.workspaces?.packages ?? [])

  for (const pattern of workspacePatterns) {
    if (!pattern.endsWith('/*')) continue
    const directory = resolve(root, pattern.slice(0, -2))
    let entries: Dirent[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries.sort((left, right) =>
      compareStrings(left.name, right.name),
    )) {
      if (!entry.isDirectory()) continue
      const packageDirectory = join(directory, entry.name)
      let manifest: PackageJson
      try {
        manifest = JSON.parse(
          await readFile(join(packageDirectory, 'package.json'), 'utf8'),
        )
      } catch {
        continue
      }
      packages.push({
        name: manifest.name,
        directory: packageDirectory,
        manifest,
        files: await discoverSourceFiles(packageDirectory),
      })
    }
  }

  return packages
}

export interface DependencyViolation {
  type:
    | 'external-direction'
    | 'local-daemon-boundary'
    | 'rpc-boundary'
    | 'undeclared-dependency'
    | 'unused-dependency'
    | 'workspace-direction'
  packageName: string
  dependency: string
}

function allowedWorkspaceDependencies(
  workspacePackage: WorkspacePackage,
  workspacePackages: readonly WorkspacePackage[],
): Set<string> {
  const relativeDirectory = workspacePackage.directory.replaceAll('\\', '/')
  if (relativeDirectory.includes('/apps/')) {
    return new Set(
      workspacePackages
        .filter((candidate) =>
          candidate.directory.replaceAll('\\', '/').includes('/packages/'),
        )
        .map((candidate) => candidate.name),
    )
  }

  const allowed: Record<string, string[]> = {
    '@ctxindex/official': [
      '@ctxindex/core',
      '@ctxindex/extension-sdk',
      '@ctxindex/profiles',
    ],
    '@ctxindex/core': ['@ctxindex/extension-sdk'],
    '@ctxindex/extension-sdk': [],
    '@ctxindex/profiles': ['@ctxindex/extension-sdk'],
  }
  return new Set(allowed[workspacePackage.name] ?? [])
}

export async function verifyWorkspaceDependencies(
  root: string,
): Promise<DependencyViolation[]> {
  const packages = await discoverWorkspacePackages(root)
  const workspaceNames = new Set(
    packages.map((workspacePackage) => workspacePackage.name),
  )
  const applicationPackages = new Set(
    packages
      .filter((workspacePackage) =>
        workspacePackage.directory.replaceAll('\\', '/').includes('/apps/'),
      )
      .map((workspacePackage) => workspacePackage.name),
  )
  const violations: DependencyViolation[] = []

  for (const workspacePackage of packages) {
    const imports = new Set<string>()
    const localSpecifierPatterns = await readLocalSpecifierPatterns(
      workspacePackage.directory,
    )
    const packageBoundaryDependencies = new Set<string>()
    const physicalPackageDirectory = await realpath(workspacePackage.directory)
    const isProtectedPackage =
      workspacePackage.name === '@ctxindex/rpc' ||
      workspacePackage.name === '@ctxindex/local-daemon'
    if (
      (workspacePackage.name === '@ctxindex/rpc' ||
        workspacePackage.name === '@ctxindex/local-daemon') &&
      workspacePackage.manifest.private !== true
    )
      packageBoundaryDependencies.add('package-private')
    for (const file of workspacePackage.files) {
      if (isProtectedPackage) {
        let physicalFile: string
        try {
          physicalFile = await realpath(file)
        } catch {
          packageBoundaryDependencies.add(
            `source-escape:${relative(workspacePackage.directory, file).replaceAll('\\', '/')}`,
          )
          continue
        }
        if (isOutsideDirectory(physicalPackageDirectory, physicalFile)) {
          packageBoundaryDependencies.add(
            `source-escape:${relative(workspacePackage.directory, file).replaceAll('\\', '/')}`,
          )
        }
      }
      const source = await readFile(file, 'utf8')
      for (const dependency of extractPackageImports(
        source,
        file,
        localSpecifierPatterns,
      ))
        imports.add(dependency)
      if (workspacePackage.name === '@ctxindex/rpc') {
        for (const dependency of await extractRpcBoundaryUses(
          source,
          file,
          workspacePackage.directory,
          physicalPackageDirectory,
          applicationPackages,
        ))
          packageBoundaryDependencies.add(dependency)
      } else if (workspacePackage.name === '@ctxindex/local-daemon') {
        for (const dependency of await extractLocalDaemonBoundaryUses(
          source,
          file,
          workspacePackage.directory,
          physicalPackageDirectory,
          applicationPackages,
        ))
          packageBoundaryDependencies.add(dependency)
      }
    }
    for (const dependency of packageBoundaryDependencies) {
      violations.push({
        type:
          workspacePackage.name === '@ctxindex/rpc'
            ? 'rpc-boundary'
            : 'local-daemon-boundary',
        packageName: workspacePackage.name,
        dependency,
      })
    }

    const runtimeDeclared = new Set(
      Object.keys(workspacePackage.manifest.dependencies ?? {}),
    )
    const declared = new Set([
      ...runtimeDeclared,
      ...Object.keys(workspacePackage.manifest.devDependencies ?? {}),
    ])
    addDeclaredFrameworkPeers(imports, declared)
    imports.delete(workspacePackage.name)

    for (const dependency of imports) {
      if (!declared.has(dependency)) {
        violations.push({
          type: 'undeclared-dependency',
          packageName: workspacePackage.name,
          dependency,
        })
      }
    }
    for (const dependency of runtimeDeclared) {
      if (!imports.has(dependency)) {
        violations.push({
          type: 'unused-dependency',
          packageName: workspacePackage.name,
          dependency,
        })
      }
    }

    const allowedWorkspace = allowedWorkspaceDependencies(
      workspacePackage,
      packages,
    )
    const packageEdges = new Set([...imports, ...declared])
    for (const dependency of packageEdges) {
      if (workspaceNames.has(dependency) && !allowedWorkspace.has(dependency)) {
        violations.push({
          type: 'workspace-direction',
          packageName: workspacePackage.name,
          dependency,
        })
      }
    }
    for (const dependency of runtimeDeclared) {
      if (
        (workspacePackage.name === '@ctxindex/extension-sdk' ||
          workspacePackage.name === '@ctxindex/profiles') &&
        !workspaceNames.has(dependency) &&
        dependency !== 'zod'
      ) {
        violations.push({
          type: 'external-direction',
          packageName: workspacePackage.name,
          dependency,
        })
      }
    }
  }

  return violations.sort(
    (left, right) =>
      compareStrings(left.packageName, right.packageName) ||
      compareStrings(left.type, right.type) ||
      compareStrings(left.dependency, right.dependency),
  )
}

async function main(): Promise<number> {
  const root = resolve(import.meta.dir, '../..')
  const violations = await verifyWorkspaceDependencies(root)
  if (violations.length === 0) {
    console.log('package-dependencies: no violations found')
    return 0
  }
  for (const violation of violations) {
    console.error(
      `${violation.type}: ${violation.packageName} -> ${violation.dependency}`,
    )
  }
  return 1
}

if (import.meta.main) process.exit(await main())
