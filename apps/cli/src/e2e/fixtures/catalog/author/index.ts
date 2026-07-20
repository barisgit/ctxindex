import {
  defineCatalog,
  defineExtension,
  packageExtension,
} from '@ctxindex/extension-sdk'

export const buildMarker = '__BUILD_MARKER__'

export default defineCatalog({
  id: 'fixture.catalog',
  label: 'Fixture Catalog',
  summary: 'Mixed package-backed Catalog fixture',
  extensions: [
    defineExtension({ id: 'fixture.catalog.literal' }),
    packageExtension(
      { kind: 'git', target: '__GIT_TARGET__' },
      'fixture.catalog.git',
    ),
    packageExtension(
      { kind: 'local', target: './packages/local' },
      'fixture.catalog.local',
    ),
  ],
})
