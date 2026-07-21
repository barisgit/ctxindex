import { describe, expect, spyOn, test } from 'bun:test'
import type {
  ExportResourceInput,
  ExportResourceResult,
} from '@ctxindex/core/export'
import { UnsupportedExportFormatError } from '@ctxindex/core/export'
import { type ExportCommandDeps, handleExportCommand } from './export'

const ref = 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one'
const deps = {
  db: {} as never,
  registry: {} as never,
  authService: {} as never,
  logger: {} as never,
}

function directServices(
  open: ExportCommandDeps['open'],
  runExport: ExportCommandDeps['runExport'],
): ExportCommandDeps {
  return {
    selectDaemon: () => {
      throw new Error('legacy selection invoked')
    },
    ensureDaemonSelection: async () => ({ status: 'unsupported' }),
    export: async () => {
      throw new Error('daemon export invoked')
    },
    open,
    runExport,
  }
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
      await handleExportCommand(
        { ref, format: 'binary' },
        directServices(open, run),
      ),
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
        directServices(open as never, async () => {
          throw new Error('must not export')
        }),
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
        { id: 'mail.message', version: 1 },
        'mbox',
        ['eml', 'json'],
      )
    }
    const error = spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await handleExportCommand(
        { ref, format: 'mbox' },
        directServices(open, run),
      ),
    ).toBe(2)
    expect(closed).toBe(true)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('mail.message@1'),
    )
    error.mockRestore()
  })

  test('selected daemon writes exact bytes without opening direct dependencies', async () => {
    const bytes = Uint8Array.of(1, 2, 3)
    let opened = false
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      expect(
        await handleExportCommand(
          { ref, format: 'binary' },
          {
            selectDaemon: () => {
              throw new Error('legacy selection invoked')
            },
            ensureDaemonSelection: async () => ({
              status: 'selected',
              selection: {} as never,
              started: true,
            }),
            export: async () => ({
              bytes,
              mediaType: 'application/octet-stream',
              format: 'binary',
              ref,
              warnings: [],
            }),
            open: async () => {
              opened = true
              throw new Error('direct dependencies opened')
            },
            runExport: async () => {
              throw new Error('direct export invoked')
            },
          },
        ),
      ).toBe(0)
      expect(opened).toBe(false)
      expect(write).toHaveBeenCalledWith(bytes)
    } finally {
      write.mockRestore()
    }
  })

  test('never falls back after a selected daemon export failure', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    let opened = false
    try {
      expect(
        await handleExportCommand(
          { ref, format: 'binary' },
          {
            selectDaemon: () => ({}) as never,
            export: async () => {
              throw Object.assign(new Error('daemon unavailable'), {
                code: 'daemon_unavailable',
              })
            },
            open: async () => {
              opened = true
              throw new Error('direct dependencies opened')
            },
            runExport: async () => {
              throw new Error('direct export invoked')
            },
          },
        ),
      ).toBe(50)
      expect(opened).toBe(false)
    } finally {
      error.mockRestore()
    }
  })
})
