import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')
const cliRoot = join(repoRoot, 'apps/cli')
const output = join(cliRoot, 'dist/ctxindex.mjs')

interface CliVersionManifest {
  readonly version: string
}

function isVersionManifest(value: unknown): value is CliVersionManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { readonly version?: unknown }).version === 'string'
  )
}

const relocatableDependencyPaths: Bun.BunPlugin = {
  name: 'relocatable-dependency-paths',
  setup(build) {
    build.onLoad(
      {
        filter:
          /(?:[\\/]thread-stream[\\/]index|[\\/]pino[\\/]lib[\\/]transport)\.js$/,
      },
      async ({ path }) => ({
        contents: (await readFile(path, 'utf8')).replaceAll(
          '__dirname',
          'import.meta.dir',
        ),
        loader: 'js',
      }),
    )
    build.onLoad(
      { filter: /[\\/]thread-stream[\\/]package\.json$/ },
      async ({ path }) => {
        const manifest = JSON.parse(await readFile(path, 'utf8')) as {
          readonly version?: unknown
        }
        if (typeof manifest.version !== 'string') {
          throw new TypeError('thread-stream package version is missing')
        }
        return {
          contents: JSON.stringify({ version: manifest.version }),
          loader: 'json',
        }
      },
    )
  },
}

const manifest = JSON.parse(
  await readFile(join(cliRoot, 'package.json'), 'utf8'),
) as unknown
if (!isVersionManifest(manifest)) {
  throw new TypeError('CLI package version is missing')
}

await mkdir(dirname(output), { recursive: true, mode: 0o755 })
const result = await Bun.build({
  entrypoints: [join(cliRoot, 'bin/ctxindex.mjs')],
  target: 'bun',
  external: ['keytar'],
  define: {
    __CTXINDEX_VERSION__: JSON.stringify(manifest.version),
  },
  plugins: [relocatableDependencyPaths],
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
const built = result.outputs[0]
if (built === undefined || result.outputs.length !== 1) {
  throw new Error(`Expected one CLI build output, got ${result.outputs.length}`)
}
const executable = await built.text()
if (executable.includes(repoRoot)) {
  throw new Error('CLI bundle contains its source checkout path')
}
await writeFile(output, executable, { mode: 0o755 })
await chmod(output, 0o755)
