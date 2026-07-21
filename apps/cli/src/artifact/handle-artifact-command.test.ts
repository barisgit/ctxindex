import { describe, expect, spyOn, test } from 'bun:test'
import type { ArtifactService } from '@ctxindex/core/artifact'
import {
  formatArtifactDownloadJson,
  formatArtifactDownloadText,
  formatArtifactListJson,
  formatArtifactListText,
} from '../format/artifact'
import { handleArtifactCommand } from './handle-artifact-command'

const originRef = 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one'
const artifactRef = `${originRef}/attachment/file`
const listed = {
  resourceRef: originRef,
  artifacts: [
    {
      ref: artifactRef,
      filename: 'file.bin',
      mediaType: 'application/octet-stream',
      byteSize: 4,
    },
  ],
  warnings: [],
}
const downloaded = {
  artifact: {
    ref: artifactRef,
    originRef,
    contentHash: `sha256:${'a'.repeat(64)}`,
    mediaType: 'application/octet-stream',
    byteSize: 4,
    retentionClass: 'cached' as const,
    createdAt: 1,
  },
  cache: 'miss' as const,
  outputPath: '/tmp/file.bin',
}
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

describe('artifact command output and handlers', () => {
  test('formats deterministic compact text and JSON without binary or CAS paths', () => {
    expect(formatArtifactListText(listed)).toBe(
      `${artifactRef}\tfile.bin\tapplication/octet-stream\t4`,
    )
    expect(formatArtifactListJson(listed)).toBe(JSON.stringify(listed))
    expect(formatArtifactDownloadText(downloaded)).toBe(
      `${artifactRef}\tmiss\t/tmp/file.bin`,
    )
    expect(formatArtifactDownloadJson(downloaded)).toBe(
      JSON.stringify(downloaded),
    )
    expect(formatArtifactDownloadJson(downloaded)).not.toContain('localPath')
  })

  test('dispatches list and download through the ArtifactService', async () => {
    const calls: unknown[] = []
    const service = {
      async list(ref: string) {
        calls.push(['list', ref])
        return listed
      },
      async download(ref: string, options: unknown) {
        calls.push(['download', ref, options])
        return downloaded
      },
    } as unknown as ArtifactService
    const open = async () => ({ artifactService: service, async close() {} })
    const log = spyOn(console, 'log').mockImplementation(() => {})

    expect(
      await handleArtifactCommand(
        { kind: 'list', ref: originRef, json: true },
        open,
      ),
    ).toBe(0)
    expect(
      await handleArtifactCommand(
        {
          kind: 'download',
          ref: artifactRef,
          outputPath: '/tmp/file.bin',
          json: false,
        },
        open,
      ),
    ).toBe(0)
    expect(calls).toEqual([
      ['list', originRef],
      [
        'download',
        artifactRef,
        { outputPath: '/tmp/file.bin', signal: expect.any(AbortSignal) },
      ],
    ])
    expect(log).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })

  test('purges through the same ArtifactService and formats JSON', async () => {
    const calls: string[] = []
    const service = {
      async purge() {
        calls.push('purge')
        return purged
      },
    } as ArtifactService
    const open = async () => ({ artifactService: service, async close() {} })
    const log = spyOn(console, 'log').mockImplementation(() => {})

    expect(
      await handleArtifactCommand({ kind: 'purge', json: true }, open),
    ).toBe(0)
    expect(calls).toEqual(['purge'])
    expect(log).toHaveBeenCalledWith(JSON.stringify(purged))
    log.mockRestore()
  })

  test('validates Refs before opening dependencies', async () => {
    let opened = false
    const open = async () => {
      opened = true
      throw new Error('must not open')
    }
    const error = spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await handleArtifactCommand(
        { kind: 'download', ref: 'bad-ref', json: false },
        open as never,
      ),
    ).toBe(2)
    expect(opened).toBe(false)
    error.mockRestore()
  })
})
