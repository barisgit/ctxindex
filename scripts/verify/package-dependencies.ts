#!/usr/bin/env bun
import type { Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  const imports = new Set<string>()

  const addSpecifier = (node: ts.Expression | undefined): void => {
    if (!node || !ts.isStringLiteralLike(node)) return
    if (
      ignoredFrameworkSpecifiers.has(node.text) ||
      localSpecifierPatterns.some((pattern) => {
        const wildcard = pattern.indexOf('*')
        if (wildcard === -1) return node.text === pattern
        return (
          node.text.startsWith(pattern.slice(0, wildcard)) &&
          node.text.endsWith(pattern.slice(wildcard + 1))
        )
      })
    )
      return
    for (const peer of frameworkSpecifierPeers.get(node.text) ?? [])
      imports.add(peer)
    const packageName = packageNameFromSpecifier(node.text)
    if (packageName) imports.add(packageName)
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

interface PackageJson {
  name: string
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
    if (entry.isFile() && sourceExtensions.has(extname(entry.name)))
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
  if (
    relativeDirectory.includes('/apps/') ||
    relativeDirectory.includes('/examples/')
  ) {
    return new Set(
      workspacePackages
        .filter((candidate) =>
          candidate.directory.replaceAll('\\', '/').includes('/packages/'),
        )
        .map((candidate) => candidate.name),
    )
  }

  const allowed: Record<string, string[]> = {
    '@ctxindex/adapters': [
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
  const violations: DependencyViolation[] = []

  for (const workspacePackage of packages) {
    const imports = new Set<string>()
    const localSpecifierPatterns = await readLocalSpecifierPatterns(
      workspacePackage.directory,
    )
    for (const file of workspacePackage.files) {
      for (const dependency of extractPackageImports(
        await readFile(file, 'utf8'),
        file,
        localSpecifierPatterns,
      ))
        imports.add(dependency)
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
