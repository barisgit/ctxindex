import {
  acquireFileLease,
  type FileLeaseMode,
  type FileLeasePurpose,
} from '../lease'

const [canonicalTarget, purpose, mode] = process.argv.slice(2) as [
  string,
  FileLeasePurpose,
  FileLeaseMode,
]

const lease = acquireFileLease({
  canonicalTarget,
  purpose,
  mode,
})
process.stdout.write(`ready:${lease.targetDigest}\n`)

let released = false
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  if (released || !chunk.split(/\r?\n/).includes('release')) return
  released = true
  lease.release()
  process.stdout.write('released\n')
})
process.stdin.resume()
process.stdin.once('end', () => {
  if (!released) lease.release()
  process.exit(0)
})
