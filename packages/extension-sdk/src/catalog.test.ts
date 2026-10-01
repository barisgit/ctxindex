import { describe, expect, test } from 'bun:test'
import {
  type CatalogDefinition,
  defineCatalog,
  defineExtension,
  packageExtension,
} from './index'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Assert<T extends true> = T

const literal = defineExtension({ id: 'fixture.literal' })
const npm = packageExtension(
  { kind: 'npm', target: '@fixture/npm@^2' },
  'fixture.npm',
)
const git = packageExtension(
  { kind: 'git', target: 'git+https://example.test/git.git#main' },
  'fixture.git',
)
const local = packageExtension(
  { kind: 'local', target: './packages/local' },
  'fixture.local',
)
const mixed = defineCatalog({
  id: 'fixture.catalog',
  label: 'Fixture Catalog',
  summary: 'Mixed literal and package entries.',
  entrySummaries: {
    'fixture.literal': 'A literal fixture Extension.',
    'fixture.npm': 'An npm-backed fixture Extension.',
  },
  extensions: [literal, npm, git, local],
})

type _CatalogIdInference = Assert<Equal<typeof mixed.id, 'fixture.catalog'>>
type _CatalogEntriesInference = Assert<
  Equal<
    typeof mixed.extensions,
    readonly [typeof literal, typeof npm, typeof git, typeof local]
  >
>
type _NpmTargetInference = Assert<
  Equal<
    typeof npm.source,
    { readonly kind: 'npm'; readonly target: '@fixture/npm@^2' }
  >
>
type _GitTargetInference = Assert<
  Equal<
    typeof git.source,
    {
      readonly kind: 'git'
      readonly target: 'git+https://example.test/git.git#main'
    }
  >
>
type _LocalTargetInference = Assert<
  Equal<
    typeof local.source,
    { readonly kind: 'local'; readonly target: './packages/local' }
  >
>
type _VersionlessEntry = Assert<
  Equal<
    'version' extends keyof (typeof mixed.extensions)[0] ? true : false,
    false
  >
>
type _EntrySummaryKeys = Assert<
  Equal<
    keyof NonNullable<typeof mixed.entrySummaries>,
    'fixture.literal' | 'fixture.npm' | 'fixture.git' | 'fixture.local'
  >
>

const publicType: CatalogDefinition = mixed
void publicType

function rejectUnknownSummaryKeyAtCompileTime(): void {
  defineCatalog({
    id: 'fixture.invalid-summary-type',
    label: 'Invalid summary type',
    entrySummaries: {
      // @ts-expect-error summaries are limited to inferred Catalog entry ids
      'fixture.missing': 'Not a Catalog entry.',
    },
    extensions: [literal, npm],
  })
}
void rejectUnknownSummaryKeyAtCompileTime

describe('Catalog authoring values', () => {
  test('returns fresh plain effect-free values and retains direct entry references', () => {
    expect(mixed).toEqual({
      kind: 'catalog',
      id: 'fixture.catalog',
      label: 'Fixture Catalog',
      summary: 'Mixed literal and package entries.',
      entrySummaries: {
        'fixture.literal': 'A literal fixture Extension.',
        'fixture.npm': 'An npm-backed fixture Extension.',
      },
      extensions: [literal, npm, git, local],
    })
    expect(mixed.extensions[0]).toBe(literal)
    expect(npm.source).toEqual({ kind: 'npm', target: '@fixture/npm@^2' })
    expect(Object.getPrototypeOf(mixed)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(npm)).toBe(Object.prototype)
  })

  test('rejects duplicate stable Extension ids across literal and package entries', () => {
    expect(() =>
      defineCatalog({
        id: 'fixture.duplicate',
        label: 'Duplicate',
        extensions: [
          literal,
          packageExtension(
            { kind: 'npm', target: '@fixture/duplicate@1' },
            literal.id,
          ),
        ],
      }),
    ).toThrow('Duplicate Catalog Extension id fixture.literal')
  })

  test('rejects summaries for Extensions outside the Catalog', () => {
    expect(() =>
      defineCatalog({
        id: 'fixture.invalid-summary',
        label: 'Invalid summary',
        entrySummaries: {
          'fixture.missing': 'Not a Catalog entry.',
        },
        extensions: [literal],
      } as never),
    ).toThrow('Unknown Catalog Extension summary fixture.missing')
  })

  test.each([
    ['nested Catalog', mixed],
    ['textual dependency reference', 'fixture.literal'],
  ])('rejects a %s entry', (_label, entry) => {
    expect(() =>
      defineCatalog({
        id: 'fixture.invalid',
        label: 'Invalid',
        extensions: [entry] as never,
      }),
    ).toThrow('Invalid Catalog Extension entry')
  })

  test('rejects more than 256 direct entries', () => {
    expect(() =>
      defineCatalog({
        id: 'fixture.large',
        label: 'Large',
        extensions: Array.from({ length: 257 }, (_, index) =>
          packageExtension(
            { kind: 'npm', target: `fixture-${index}@1` },
            `fixture.entry-${index}`,
          ),
        ),
      }),
    ).toThrow('at most 256')
  })

  test.each([
    ['source kind', { kind: 'archive', target: 'fixture' }],
    ['empty target', { kind: 'npm', target: '' }],
    [
      'unnormalized target',
      { kind: 'git', target: ' git+https://example.test/repo.git' },
    ],
    ['NUL target', { kind: 'local', target: './fixture\0ignored' }],
    ['source shape', { kind: 'npm', target: 'fixture', credentials: 'secret' }],
  ])('rejects an invalid package %s', (_label, source) => {
    expect(() => packageExtension(source as never, 'fixture.package')).toThrow(
      'Invalid Extension package',
    )
  })
})
