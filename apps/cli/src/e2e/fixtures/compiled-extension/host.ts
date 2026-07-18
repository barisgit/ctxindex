import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

interface HostApi {
  version: string
  defineAdapter<T extends { id: string }>(definition: T): T
}

const extensionPath = process.argv[2]
if (!extensionPath) {
  throw new Error('usage: host <extension.ts>')
}

const loaded = await import(pathToFileURL(resolve(extensionPath)).href)
if (typeof loaded.default !== 'function') {
  throw new Error('extension must default-export a factory')
}

const api: HostApi = {
  version: 'fixture-host-v1',
  defineAdapter: (definition) => definition,
}
const extension = await loaded.default(api)
console.log(JSON.stringify(extension))
