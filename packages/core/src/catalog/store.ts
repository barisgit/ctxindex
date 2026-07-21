import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import * as TOML from '@iarna/toml'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import { configDir } from '../paths'
import { type CatalogRecord, catalogsDocumentSchema } from './schema'

export interface CatalogStoreOptions {
  readonly configRoot?: string
}

async function readToml(path: string): Promise<unknown> {
  const file = Bun.file(path)
  if (!(await file.exists())) return undefined
  try {
    return TOML.parse(await file.text())
  } catch (cause) {
    throw new TypeError(`Failed to parse ${path}`, { cause })
  }
}

async function fsync(path: string): Promise<void> {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeToml(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  try {
    await writeFile(
      temporary,
      TOML.stringify(value as Parameters<typeof TOML.stringify>[0]),
      { mode: 0o600 },
    )
    await fsync(temporary)
    await rename(temporary, path)
    await fsync(dirname(path))
  } finally {
    await rm(temporary, { force: true })
  }
}

export class CatalogStore {
  readonly catalogsPath: string

  constructor(options: CatalogStoreOptions = {}) {
    this.catalogsPath = join(options.configRoot ?? configDir(), 'catalogs.toml')
  }

  async readCatalogs(): Promise<readonly CatalogRecord[]> {
    const parsed = await readToml(this.catalogsPath)
    if (parsed === undefined) return []
    return catalogsDocumentSchema.parse(parsed).catalogs
  }

  async writeCatalogs(records: readonly CatalogRecord[]): Promise<void> {
    const document = catalogsDocumentSchema.parse({
      schema_version: 2,
      catalogs: [...records].sort((left, right) =>
        compareUnicodeCodePoints(left.name, right.name),
      ),
    })
    await writeToml(this.catalogsPath, document)
  }
}
