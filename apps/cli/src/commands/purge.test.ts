import { describe, expect, spyOn, test } from 'bun:test'
import type { ArtifactService } from '@ctxindex/core/artifact'
import {
  formatPurgeArtifactsJson,
  formatPurgeArtifactsText,
  handlePurgeArtifactsCommand,
} from './purge'

const purged = {
  artifactCountRemoved: 2,
  objectCountRemoved: 3,
  logicalBytesFreed: 12,
  physicalBytesFreed: 19,
  diskAccounting: {
    artifactCount: 0,
    objectCount: 0,
    logicalBytes: 0,
    physicalBytes: 0,
  },
}

describe('purge artifacts command', () => {
  test('formats deterministic compact text and JSON', () => {
    expect(formatPurgeArtifactsText(purged)).toBe('2\t3\t12\t19')
    expect(formatPurgeArtifactsJson(purged)).toBe(JSON.stringify(purged))
  })

  test('dispatches through ArtifactService and closes dependencies', async () => {
    let calls = 0
    let closed = false
    const service = {
      async purge() {
        calls += 1
        return purged
      },
    } as ArtifactService
    const open = async () => ({
      artifactService: service,
      async close() {
        closed = true
      },
    })
    const log = spyOn(console, 'log').mockImplementation(() => {})

    expect(await handlePurgeArtifactsCommand(['--json'], open)).toBe(0)
    expect(calls).toBe(1)
    expect(closed).toBe(true)
    expect(log).toHaveBeenCalledWith(JSON.stringify(purged))
    log.mockRestore()
  })

  test('rejects invalid args before opening dependencies', async () => {
    let opened = false
    const open = async () => {
      opened = true
      throw new Error('must not open')
    }
    const error = spyOn(console, 'error').mockImplementation(() => {})

    expect(await handlePurgeArtifactsCommand(['--force'], open as never)).toBe(
      2,
    )
    expect(opened).toBe(false)
    error.mockRestore()
  })
})
