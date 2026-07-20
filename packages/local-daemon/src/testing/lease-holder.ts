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

process.stdin.resume()
process.stdin.once('end', () => {
  lease.release()
  process.exit(0)
})
