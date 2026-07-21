import { describe, expect, spyOn, test } from 'bun:test'
import type {
  ExportResourceInput,
  ExportResourceResult,
} from '@ctxindex/core/export'
import { UnsupportedExportFormatError } from '@ctxindex/core/export'
import { handleExportCommand } from './export'

const ref = 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one'
const deps = {
  db: {} as never,
  registry: {} as never,
  authService: {} as never,
  logger: {} as never,
}

describe('export command', () => {
  test('writes exact binary bytes directly, reports warnings to stderr, and closes dependencies', async () => {
    const bytes = Uint8Array.of(0, 255, 1)
    const calls: unknown[] = []
    const close = async () => {
      calls.push('close')
    }
    const open = async () => ({ ...deps, close })
    const run = async (
      input: ExportResourceInput,
    ): Promise<ExportResourceResult> => {
      calls.push(input)
      return {
        bytes,
        mediaType: 'application/octet-stream',
        format: 'binary',
        ref,
        warnings: [{ code: 'retrieved', message: 'hydrated', ref }],
      }
    }
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true)
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const error = spyOn(console, 'error').mockImplementation(() => {})

    expect(
      await handleExportCommand({ ref, format: 'binary' }, open, run),
    ).toBe(0)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(bytes)
    expect(log).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('retrieved\thydrated')
    expect(calls).toEqual([
      expect.objectContaining({
        ref,
        format: 'binary',
        signal: expect.any(AbortSignal),
      }),
      'close',
    ])
    write.mockRestore()
    log.mockRestore()
    error.mockRestore()
  })

  test('rejects invalid input before dependencies and returns help without opening', async () => {
    let opened = false
    const open = async () => {
      opened = true
      throw new Error('must not open')
    }
    const error = spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await handleExportCommand(
        { ref: 'not-a-ref', format: 'json' },
        open as never,
      ),
    ).toBe(2)
    expect(opened).toBe(false)
    error.mockRestore()
  })

  test('maps unsupported formats to exit 2 and always closes dependencies', async () => {
    let closed = false
    const open = async () => ({
      ...deps,
      async close() {
        closed = true
      },
    })
    const run = async () => {
      throw new UnsupportedExportFormatError(
        { id: 'communication.message', version: 1 },
        'mbox',
        ['eml', 'json'],
      )
    }
    const error = spyOn(console, 'error').mockImplementation(() => {})
    expect(await handleExportCommand({ ref, format: 'mbox' }, open, run)).toBe(
      2,
    )
    expect(closed).toBe(true)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('communication.message@1'),
    )
    error.mockRestore()
  })
})
