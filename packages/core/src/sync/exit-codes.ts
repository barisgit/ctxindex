/**
 * SPEC §12 exit code mapping for sync terminal failures.
 */
export const EXIT_CODES = {
  OK: 0,
  NEEDS_AUTH: 10,
  RATE_LIMITED: 20,
  NETWORK_ERROR: 30,
  PERMISSION_DENIED: 40,
  OTHER_FAILURE: 50,
  CANCELLED: 130,
} as const

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]

/**
 * Maps CtxindexSyncError.code to exit code + sync_runs.status + source_sync_state.last_status
 */
export interface ErrorMapping {
  exitCode: ExitCode
  runStatus: 'failed' | 'cancelled'
  lastStatus: 'needs_auth' | 'failed' | 'disabled' | 'idle'
}

export function mapSyncErrorCode(code: string): ErrorMapping {
  switch (code) {
    case 'needs_auth':
    case 'invalid_grant':
      return {
        exitCode: EXIT_CODES.NEEDS_AUTH,
        runStatus: 'failed',
        lastStatus: 'needs_auth',
      }
    case 'rate_limited':
      return {
        exitCode: EXIT_CODES.RATE_LIMITED,
        runStatus: 'failed',
        lastStatus: 'failed',
      }
    case 'network_error':
    case 'provider_error':
      return {
        exitCode: EXIT_CODES.NETWORK_ERROR,
        runStatus: 'failed',
        lastStatus: 'failed',
      }
    case 'permission_denied':
      return {
        exitCode: EXIT_CODES.PERMISSION_DENIED,
        runStatus: 'failed',
        lastStatus: 'disabled',
      }
    case 'cancelled':
      return {
        exitCode: EXIT_CODES.CANCELLED,
        runStatus: 'cancelled',
        lastStatus: 'idle',
      }
    default:
      return {
        exitCode: EXIT_CODES.OTHER_FAILURE,
        runStatus: 'failed',
        lastStatus: 'failed',
      }
  }
}
