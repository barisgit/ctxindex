import {
  acquireFileLease,
  type FileLease,
  FileLeaseConflictError,
  type FileLeaseMode,
  type FileLeasePurpose,
} from '../lease'

const [canonicalTarget, purpose, mode] = process.argv.slice(2) as [
  string,
  FileLeasePurpose,
  FileLeaseMode,
]

let lease: FileLease
try {
  lease = acquireFileLease({
    canonicalTarget,
    purpose,
    mode,
  })
} catch (error) {
  // Contention is an expected outcome for multi-process gates, so report it
  // as a distinct holder-neutral line and exit code instead of a crash.
  if (!(error instanceof FileLeaseConflictError)) throw error
  process.stdout.write('conflict\n')
  process.exit(73)
}
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
