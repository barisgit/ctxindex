declare module 'pino-roll' {
  import type { Writable } from 'node:stream'

  export interface PinoRollOptions {
    file: string | (() => string)
    size?: string | number
    frequency?: 'daily' | 'hourly' | number
    extension?: string
    symlink?: boolean
    limit?: {
      count?: number
      removeOtherLogFiles?: boolean
    }
    dateFormat?: string
    mkdir?: boolean
  }

  export interface PinoRollStream extends Writable {
    file?: string
    flush?: (callback?: (error?: Error | null) => void) => void
  }

  export default function pinoRoll(
    options: PinoRollOptions,
  ): Promise<PinoRollStream>
}
