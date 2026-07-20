import { createHash } from 'node:crypto'
import {
  cp,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import { configDir, dataDir } from '../paths'
import {
  type DirectExtensionInstallationRecord,
  directExtensionDocumentSchema,
  directExtensionInstallationRecordSchema,
} from './schema'

const DIGEST_PATTERN = /^[0-9a-f]{64}$/

function validateDigest(digest: string): string {
  if (!DIGEST_PATTERN.test(digest))
    throw new TypeError('Invalid materialization digest')
  return digest
}

export function directExtensionMaterializationPath(
  dataRoot: string,
  digest: string,
): string {
  return join(
    dataRoot,
    'direct-extensions',
    'materializations',
    validateDigest(digest),
  )
}

async function directoryEntries(
  root: string,
  current = root,
): Promise<string[]> {
  const paths: string[] = []
  const entries = await readdir(current, { withFileTypes: true })
  entries.sort((a, b) => compareUnicodeCodePoints(a.name, b.name))
  for (const entry of entries) {
    const path = join(current, entry.name)
    const rel = relative(root, path).split(sep).join('/')
    paths.push(rel)
    if (entry.isDirectory()) paths.push(...(await directoryEntries(root, path)))
    else if (!entry.isFile())
      throw new TypeError(`Unsupported materialization entry ${rel}`)
  }
  return paths
}

export async function hashDirectory(root: string): Promise<string> {
  const canonical = resolve(root)
  const info = await stat(canonical)
  if (!info.isDirectory())
    throw new TypeError('Materialization root must be a directory')
  const hash = createHash('sha256')
  for (const rel of await directoryEntries(canonical)) {
    const path = join(canonical, rel)
    const item = await stat(path)
    hash.update(item.isDirectory() ? 'd\0' : 'f\0')
    hash.update(rel)
    hash.update('\0')
    hash.update(String(item.mode & 0o777))
    hash.update('\0')
    if (item.isFile()) hash.update(await readFile(path))
  }
  return hash.digest('hex')
}

async function fsyncFile(path: string): Promise<void> {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function fsyncTree(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) await fsyncTree(path)
    else if (entry.isFile()) await fsyncFile(path)
  }
  await fsyncFile(root)
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

export interface DirectExtensionStoreOptions {
  readonly configRoot?: string
  readonly dataRoot?: string
  readonly lockTimeoutMs?: number
}

export class DirectExtensionStore {
  readonly recordsPath: string
  readonly materializationsRoot: string
  readonly lockPath: string
  readonly lockTimeoutMs: number

  constructor(options: DirectExtensionStoreOptions = {}) {
    const configRoot = options.configRoot ?? configDir()
    const dataRoot = options.dataRoot ?? dataDir()
    this.recordsPath = join(configRoot, 'direct-extensions.json')
    this.materializationsRoot = join(
      dataRoot,
      'direct-extensions',
      'materializations',
    )
    this.lockPath = join(configRoot, '.direct-extensions.lock')
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5_000
  }

  async readRecords(): Promise<readonly DirectExtensionInstallationRecord[]> {
    const file = Bun.file(this.recordsPath)
    if (!(await file.exists())) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch (cause) {
      throw new TypeError('Direct Extension records are not valid JSON', {
        cause,
      })
    }
    return directExtensionDocumentSchema.parse(parsed).extensions
  }

  async readRecordsForLoading(): Promise<{
    readonly records: readonly DirectExtensionInstallationRecord[]
    readonly diagnostics: readonly string[]
  }> {
    const file = Bun.file(this.recordsPath)
    if (!(await file.exists())) return { records: [], diagnostics: [] }
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      return {
        records: [],
        diagnostics: ['Direct Extension records are not valid JSON'],
      }
    }
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      (parsed as { schema_version?: unknown }).schema_version !== 1 ||
      !Array.isArray((parsed as { extensions?: unknown }).extensions)
    ) {
      return {
        records: [],
        diagnostics: ['Direct Extension record document is invalid'],
      }
    }
    const records: DirectExtensionInstallationRecord[] = []
    const diagnostics: string[] = []
    const seen = new Set<string>()
    const duplicate = new Set<string>()
    for (const [index, candidate] of (
      parsed as { extensions: readonly unknown[] }
    ).extensions.entries()) {
      const result =
        directExtensionInstallationRecordSchema.safeParse(candidate)
      if (!result.success) {
        diagnostics.push(`Direct Extension record ${index} is invalid`)
        continue
      }
      if (seen.has(result.data.id)) duplicate.add(result.data.id)
      seen.add(result.data.id)
      records.push(result.data)
    }
    for (const id of duplicate)
      diagnostics.push(`Direct Extension ${id} has duplicate records`)
    return {
      records: records.filter((record) => !duplicate.has(record.id)),
      diagnostics,
    }
  }

  async writeRecords(
    records: readonly DirectExtensionInstallationRecord[],
  ): Promise<void> {
    const document = directExtensionDocumentSchema.parse({
      schema_version: 1,
      extensions: [...records].sort((a, b) =>
        compareUnicodeCodePoints(a.id, b.id),
      ),
    })
    await mkdir(dirname(this.recordsPath), { recursive: true, mode: 0o700 })
    const temporary = `${this.recordsPath}.${process.pid}.${crypto.randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
        mode: 0o600,
      })
      await fsyncFile(temporary)
      await rename(temporary, this.recordsPath)
      await fsyncFile(dirname(this.recordsPath)).catch(() => undefined)
    } finally {
      await rm(temporary, { force: true })
    }
  }

  async withLifecycleLock<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.lockPath), { recursive: true, mode: 0o700 })
    const started = Date.now()
    while (true) {
      try {
        await mkdir(this.lockPath, { mode: 0o700 })
        await writeFile(join(this.lockPath, 'owner'), String(process.pid), {
          mode: 0o600,
        })
        break
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause
        let stale = false
        try {
          const owner = Number(
            await readFile(join(this.lockPath, 'owner'), 'utf8'),
          )
          if (Number.isSafeInteger(owner) && owner > 0) {
            try {
              process.kill(owner, 0)
            } catch (probe) {
              stale = (probe as NodeJS.ErrnoException).code === 'ESRCH'
            }
          }
        } catch {
          const lockInfo = await stat(this.lockPath).catch(() => undefined)
          stale =
            lockInfo !== undefined &&
            Date.now() - lockInfo.mtimeMs >= this.lockTimeoutMs
        }
        if (stale) {
          await rm(this.lockPath, { recursive: true, force: true })
          continue
        }
        if (Date.now() - started >= this.lockTimeoutMs) {
          throw Object.assign(new Error('Direct Extension lifecycle is busy'), {
            code: 'extension_conflict',
            exitCode: 50,
          })
        }
        await delay(20)
      }
    }
    try {
      return await operation()
    } finally {
      await rm(this.lockPath, { recursive: true, force: true })
    }
  }

  async publishMaterialization(
    stagingRoot: string,
    digest: string,
  ): Promise<string> {
    const expected = validateDigest(digest)
    await mkdir(this.materializationsRoot, { recursive: true, mode: 0o700 })
    const target = join(this.materializationsRoot, expected)
    if (await Bun.file(target).exists()) {
      if ((await hashDirectory(target)) !== expected) {
        throw Object.assign(new Error('Conflicting direct materialization'), {
          code: 'extension_conflict',
          exitCode: 50,
        })
      }
      return target
    }
    const candidate = await mkdtemp(
      join(this.materializationsRoot, '.publish-'),
    )
    try {
      await cp(stagingRoot, candidate, {
        recursive: true,
        dereference: true,
        force: false,
      })
      if ((await hashDirectory(candidate)) !== expected) {
        throw new TypeError(
          'Staged materialization digest changed during publication',
        )
      }
      await fsyncTree(candidate)
      try {
        await rename(candidate, target)
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code
        if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw cause
        if ((await hashDirectory(target)) !== expected) {
          throw Object.assign(new Error('Conflicting direct materialization'), {
            code: 'extension_conflict',
            exitCode: 50,
          })
        }
      }
      await fsyncFile(this.materializationsRoot)
      return target
    } finally {
      await rm(candidate, { recursive: true, force: true })
    }
  }

  async collectUnreferencedMaterializations(): Promise<void> {
    const records = await this.readRecords()
    const referenced = new Set(
      records.map((record) => record.materialization_digest),
    )
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(this.materializationsRoot, {
        withFileTypes: true,
      })
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return
      throw cause
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith('.') ||
        referenced.has(entry.name)
      )
        continue
      if (!DIGEST_PATTERN.test(entry.name)) continue
      await rm(join(this.materializationsRoot, entry.name), {
        recursive: true,
        force: true,
      })
    }
  }

  async discardMaterializationIfUnreferenced(digest: string): Promise<void> {
    const expected = validateDigest(digest)
    const records = await this.readRecords()
    if (records.some((record) => record.materialization_digest === expected)) {
      return
    }
    await rm(join(this.materializationsRoot, expected), {
      recursive: true,
      force: true,
    })
  }
}
