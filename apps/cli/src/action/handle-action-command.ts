import { readFile } from 'node:fs/promises'
import { describeAction, runAction } from '@ctxindex/core/action'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import {
  actionDescribeUsage,
  actionRunUsage,
  parseActionArgs,
} from '../args/action'
import { type CliDeps, openDeps } from '../deps'
import { formatActionDescribeText, formatActionRunText } from '../format/action'
import { mapErrorToExit } from '../format/exit'

export type ActionDeps = Pick<
  CliDeps,
  'db' | 'registry' | 'authService' | 'logger' | 'close'
>
type OpenActionDeps = () => Promise<ActionDeps>

export interface ActionServices {
  readonly describe: typeof describeAction
  readonly run: typeof runAction
}

const actionServices: ActionServices = {
  describe: describeAction,
  run: runAction,
}

function invalidInput(): CtxindexValidationError {
  return new CtxindexValidationError(
    'invalid_action_input',
    'Action input must be inline JSON or a readable UTF-8 JSON file',
  )
}

export async function parseActionInput(value: string): Promise<unknown> {
  try {
    return JSON.parse(value)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }

  try {
    return JSON.parse(await readFile(value, 'utf8'))
  } catch {
    throw invalidInput()
  }
}

export async function handleActionCommand(
  args: string[],
  open: OpenActionDeps = openDeps,
  services: ActionServices = actionServices,
): Promise<number> {
  const parsed = parseActionArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(
      `${parsed.message}. Try: ${args[0] === 'run' ? actionRunUsage : actionDescribeUsage}`,
    )
    return 2
  }

  let actionInput: unknown
  if (parsed.kind === 'run') {
    try {
      actionInput = await parseActionInput(parsed.input)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      return mapErrorToExit(error)
    }
  }

  let deps: ActionDeps | undefined
  try {
    deps = await open()
    if (parsed.kind === 'describe') {
      const result = services.describe({
        db: deps.db,
        registry: deps.registry,
        actionId: parsed.actionId,
        ...(parsed.sourceId ? { sourceId: parsed.sourceId } : {}),
      })
      console.log(
        parsed.json ? JSON.stringify(result) : formatActionDescribeText(result),
      )
      return 0
    }

    const result = await services.run({
      db: deps.db,
      registry: deps.registry,
      authService: deps.authService,
      logger: deps.logger,
      actionId: parsed.actionId,
      sourceId: parsed.sourceId,
      actionInput,
      signal: new AbortController().signal,
      confirmIrreversible: parsed.confirmIrreversible,
    })
    console.log(
      parsed.json ? JSON.stringify(result) : formatActionRunText(result),
    )
    for (const warning of result.warnings) {
      console.error(`${warning.code}\t${warning.message}`)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps?.close()
  }
}
