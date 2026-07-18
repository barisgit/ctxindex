import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import * as TOML from '@iarna/toml'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import { configDir } from '../paths'
import {
  type CatalogRecord,
  catalogsDocumentSchema,
  type InstalledExtensionRecord,
  installedExtensionsDocumentSchema,
} from './schema'

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

async function writeToml(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(
    temporary,
    TOML.stringify(value as Parameters<typeof TOML.stringify>[0]),
    { mode: 0o600 },
  )
  await rename(temporary, path)
}

export class CatalogStore {
  readonly catalogsPath: string
  readonly installedPath: string

  constructor(options: CatalogStoreOptions = {}) {
    const root = options.configRoot ?? configDir()
    this.catalogsPath = join(root, 'catalogs.toml')
    this.installedPath = join(root, 'installed-extensions.toml')
  }

  async readCatalogs(): Promise<readonly CatalogRecord[]> {
    const parsed = await readToml(this.catalogsPath)
    if (parsed === undefined) return []
    return catalogsDocumentSchema.parse(parsed).catalogs
  }

  async writeCatalogs(records: readonly CatalogRecord[]): Promise<void> {
    const catalogs = [...records].sort((a, b) =>
      compareUnicodeCodePoints(a.name, b.name),
    )
    const document = catalogsDocumentSchema.parse({
      schema_version: 1,
      catalogs,
    })
    await writeToml(this.catalogsPath, document)
  }

  async readInstalled(): Promise<readonly InstalledExtensionRecord[]> {
    const parsed = await readToml(this.installedPath)
    if (parsed === undefined) return []
    return installedExtensionsDocumentSchema.parse(parsed).extensions
  }

  async writeInstalled(
    records: readonly InstalledExtensionRecord[],
  ): Promise<void> {
    const extensions = [...records].sort(
      (a, b) => compareUnicodeCodePoints(a.id, b.id) || a.version - b.version,
    )
    const document = installedExtensionsDocumentSchema.parse({
      schema_version: 1,
      extensions,
    })
    await writeToml(this.installedPath, document)
  }
}
