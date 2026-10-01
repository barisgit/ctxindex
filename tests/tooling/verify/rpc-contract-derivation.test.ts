import { expect, test } from 'bun:test'
import { Glob } from 'bun'
import ts from 'typescript'
import { z } from 'zod'
import { daemonContract } from '../../../packages/rpc/src/contract'

test('RPC contract derivation has no handwritten application or error mapping boundary', async () => {
  const source = (name: string) => Bun.file(`packages/rpc/src/${name}`).text()
  const [contract, router, schemas, application] = await Promise.all([
    source('contract.ts'),
    source('router.ts'),
    source('schemas.ts'),
    Bun.file('apps/daemon/src/application.ts').text(),
  ])

  expect(contract).toContain('oc.errors(rpcFailureRegistry)')
  expect(contract).not.toContain('rpcErrorDefinitions')
  expect(contract).not.toContain('rpcFailureErrorCode')
  expect(router).toContain('InferContractRouterInputs<typeof daemonContract>')
  expect(router).toContain('InferContractRouterOutputs<typeof daemonContract>')
  expect(router).not.toContain('export interface DaemonRpcApplication')
  expect(router).not.toContain('switch (failure.kind)')
  expect(schemas).toContain('export const rpcFailureRegistry =')
  expect(application).toMatch(
    /import (?:type )?\{[^}]*\bDaemonRpcApplication\b[^}]*\} from '@ctxindex\/rpc'/,
  )
  expect(application).toContain(
    'export class DaemonApplication implements DaemonRpcApplication',
  )
})

type ContractNode = { readonly [key: string]: unknown }
type SchemaDef = {
  readonly type?: string
  readonly [key: string]: unknown
}

function procedures(node: unknown, path: string[] = []): [string, unknown][] {
  const contract = node as ContractNode
  if (contract['~orpc']) {
    const definition = contract['~orpc'] as { inputSchema?: unknown }
    return [[path.join('.'), definition.inputSchema]]
  }
  return Object.entries(contract).flatMap(([key, child]) =>
    procedures(child, [...path, key]),
  )
}

function schemaDef(schema: unknown): SchemaDef | undefined {
  return (schema as { _zod?: { def?: SchemaDef } } | undefined)?._zod?.def
}

// Names that would turn the daemon into a remote executor for CLI argv or an
// opaque command instead of one semantic, typed application operation.
const tunnelSegment =
  /^(cli|cmd|command|commands|exec|execute|invoke|call|dispatch|tunnel|proxy|forward|shell|raw)$/i
const tunnelField =
  /^(argv|args|arguments|cli|cmd|command|commands|commandline|exec|shell|script|procedure|method|operation)$/i

// Bounded JSON owned by one semantic operation and validated by the daemon
// against the active registry; neither can select a different operation.
const typedPayloads = new Set(['action.run.actionInput', 'oauthApp.add.config'])
const wrapperTypes = new Set([
  'optional',
  'nullable',
  'readonly',
  'default',
  'nonoptional',
  'prefault',
])
const scalarTypes = new Set(['string', 'number', 'boolean', 'enum', 'literal'])

function inputViolations(schema: unknown, path: string): string[] {
  const def = schemaDef(schema)
  const type = def?.type
  if (type && wrapperTypes.has(type))
    return inputViolations(def.innerType, path)
  if (typedPayloads.has(path) || (type && scalarTypes.has(type))) return []
  if (type === 'array') return inputViolations(def.element, `${path}[]`)
  if (type === 'union')
    return (def.options as unknown[]).flatMap((option) =>
      inputViolations(option, path),
    )
  if (type === 'object') {
    const violations =
      schemaDef(def.catchall)?.type === 'never'
        ? []
        : [`${path}: non-strict object`]
    for (const [key, value] of Object.entries(
      def.shape as Record<string, unknown>,
    )) {
      const child = `${path}.${key}`
      if (tunnelField.test(key)) violations.push(`${child}: command field`)
      violations.push(...inputViolations(value, child))
    }
    return violations
  }
  return [`${path}: untyped ${type ?? 'unknown'} payload`]
}

function tunnelViolations(contract: unknown): string[] {
  return procedures(contract).flatMap(([path, input]) => [
    ...(path.split('.').some((segment) => tunnelSegment.test(segment))
      ? [`${path}: generic command procedure`]
      : []),
    ...inputViolations(input, path),
  ])
}

test('daemon contract exposes no generic command tunnel or untyped payload', () => {
  expect(tunnelViolations(daemonContract)).toEqual([])
})

test('tunnel guard rejects argv dispatch, opaque payloads, and loose inputs', () => {
  const input = (inputSchema: unknown) => ({ '~orpc': { inputSchema } })
  expect(
    tunnelViolations({
      cli: { exec: input(z.strictObject({ argv: z.array(z.string()) })) },
      realm: {
        add: input(z.object({ slug: z.string() })),
        run: input(
          z.strictObject({
            payload: z.unknown(),
            options: z.record(z.string(), z.string()),
          }),
        ),
      },
    }),
  ).toEqual([
    'cli.exec: generic command procedure',
    'cli.exec.argv: command field',
    'realm.add: non-strict object',
    'realm.run.payload: untyped unknown payload',
    'realm.run.options: untyped record payload',
  ])
})

const namespaceProcedures = new Map(
  Object.entries(daemonContract).map(([namespace, node]) => [
    namespace,
    new Set(Object.keys(node)),
  ]),
)
const procedurePaths = new Set(procedures(daemonContract).map(([path]) => path))

function memberName(member: ts.TypeElement): string | undefined {
  const name = member.name
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined
}

// DaemonRpcApplication is derived from the contract in @ctxindex/rpc. Any other
// type shaped like its namespaces, or a table of procedure paths, is a second
// signature list that can drift from the contract.
function parallelSignatureViolations(path: string, text: string): string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const line = (node: ts.Node) =>
    file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
  const violations: string[] = []
  const pathLiterals = new Set<string>()

  const visit = (node: ts.Node): void => {
    if (
      (ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name?.text === 'DaemonRpcApplication'
    )
      violations.push(`${path}:${line(node)}: redeclares DaemonRpcApplication`)
    if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
      const namespaces = node.members.filter((member) => {
        const known = namespaceProcedures.get(memberName(member) ?? '')
        if (!known || !ts.isPropertySignature(member) || !member.type)
          return false
        return (
          ts.isTypeLiteralNode(member.type) &&
          member.type.members.some((inner) =>
            known.has(memberName(inner) ?? ''),
          )
        )
      })
      if (namespaces.length >= 2)
        violations.push(
          `${path}:${line(node)}: handwritten procedure signature list`,
        )
    }
    if (ts.isStringLiteralLike(node) && procedurePaths.has(node.text))
      pathLiterals.add(node.text)
    ts.forEachChild(node, visit)
  }

  visit(file)
  if (pathLiterals.size >= 3)
    violations.push(`${path}: handwritten procedure path list`)
  return violations
}

test('production code declares no parallel daemon procedure or application signature list', async () => {
  const violations: string[] = []
  for await (const path of new Glob('{apps,packages}/*/src/**/*.ts').scan(
    '.',
  )) {
    if (
      path.startsWith('packages/rpc/src/') ||
      path.endsWith('.test.ts') ||
      path.includes('/e2e/')
    )
      continue
    violations.push(
      ...parallelSignatureViolations(path, await Bun.file(path).text()),
    )
  }
  expect(violations).toEqual([])
})

test('parallel signature guard rejects a handwritten application interface and path table', () => {
  expect(
    parallelSignatureViolations(
      'fixture.ts',
      [
        'type DaemonRpcApplication = { system: { health(): void } }',
        'interface DaemonProcedures {',
        '  realm: { add(input: unknown): Promise<unknown>; list(): Promise<unknown> }',
        '  source: { list(): Promise<unknown> }',
        '}',
        "const table = ['realm.add', 'realm.list', 'source.list']",
      ].join('\n'),
    ),
  ).toEqual([
    'fixture.ts:1: redeclares DaemonRpcApplication',
    'fixture.ts:2: handwritten procedure signature list',
    'fixture.ts: handwritten procedure path list',
  ])
})
