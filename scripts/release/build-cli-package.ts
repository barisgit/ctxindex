import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')
const cliRoot = join(repoRoot, 'apps/cli')
const output = join(cliRoot, 'dist/ctxindex.mjs')
const daemonOutput = join(cliRoot, 'dist/ctxindex-daemon')

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
async function buildExecutable(
  entrypoint: string,
  destination: string,
  packagedCli: boolean,
): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: 'bun',
    external: ['keytar'],
    define: {
      __CTXINDEX_VERSION__: JSON.stringify(manifest.version),
      ...(packagedCli ? { __CTXINDEX_PACKAGED__: 'true' } : {}),
    },
    plugins: [relocatableDependencyPaths],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  const built = result.outputs[0]
  if (built === undefined || result.outputs.length !== 1) {
    throw new Error(`Expected one build output, got ${result.outputs.length}`)
  }
  const bundled = await built.text()
  const executable = bundled.startsWith('#!')
    ? bundled
    : `#!/usr/bin/env bun\n${bundled}`
  if (executable.includes(repoRoot)) {
    throw new Error('Bundle contains its source checkout path')
  }
  await writeFile(destination, executable, { mode: 0o755 })
  await chmod(destination, 0o755)
}

await buildExecutable(join(cliRoot, 'bin/ctxindex.mjs'), output, true)
await buildExecutable(
  join(repoRoot, 'apps/daemon/src/main.ts'),
  daemonOutput,
  false,
)
